import { supabase } from './supabase.js';
import * as aiProviders from './aiProviders.js';

// AI media search for the assistant chat.
//
// "Find the cream floral shirt I wore with camo pants" can't be answered by asking an
// LLM about the library (5k+ assets) or by one keyword query, so it runs as a funnel:
//   1. understand  — one LLM call turns the request into concepts (each a list of
//                    synonyms drawn from the library's real tag vocabulary)
//   2. scan        — SQL checks EVERY asset's search document against the concepts the
//                    tags can express (exhaustive, ~0.4s); assets hitting all of them
//                    rank first, then near-misses missing one if there aren't enough.
//                    Attributes the tag vocabulary can't express (a shade like "cream")
//                    are "soft": they only rank candidates, and the photo check decides
//   3. sanity-check— an LLM reads each candidate's tags to drop false hits ("cream" the
//                    skincare product, "top" in "Top Performer")
//   4. look        — the best survivors' thumbnails go to a vision model, which says
//                    whether the photo really shows what was asked (tags can't say
//                    "cream shirt" vs "cream pants + white shirt")
// Steps 3-4 degrade gracefully: if a provider call fails, results fall back to the
// previous stage's ranking and the reply says so.

const MAX_CONCEPTS = 8;
const MAX_WORDS_PER_CONCEPT = 14;
const MIN_GOOD_RESULTS = 6;
const SCAN_LIMIT = 200;
const TEXT_CHECK_BATCH = 60;
const TEXT_CHECK_MAX = 120;
const VISION_MAX = 18;
const MAX_VISION_ROUNDS = 3;
const ENOUGH_CONFIRMED = 3;
const VISION_BATCH = 6;
// The MCP worker queue holds at most 4 active jobs per user and the worker rejects (and
// stops on) any task name outside shared/aiModelPolicy.js, so stay well under the queue
// limit and reuse the existing 'chat' and 'auto_tag' tasks rather than inventing new ones.
const VISION_CONCURRENCY = 3;
const TEXT_CONCURRENCY = 2;
const CHAT_TASK = 'chat';
const VISION_TASK = 'auto_tag';
export const MAX_RESULTS_SHOWN = 24;

// ─── Intent ───────────────────────────────────────────────────────────────────

const SEARCH_VERB = /\b(find|show|search|look(?:ing)?\s+for|pull\s+up|get\s+me|do\s+i\s+have|any|which|where)\b/i;
const MEDIA_NOUN = /\b(photos?|pics?|pictures?|images?|videos?|clips?|shots?|selfies?|reels?|assets?|footage|media|wearing|wore|outfits?)\b/i;

/** Cheap gate so ordinary chat doesn't pay for the understanding call. */
export function looksLikeMediaSearch(message, { previousWasSearch = false } = {}) {
  const text = String(message || '');
  if (MEDIA_NOUN.test(text) && (SEARCH_VERB.test(text) || /\b(of|with|in)\b/i.test(text))) return true;
  if (/\b(look(?:ing)?\s+for|find me|show me)\b/i.test(text)) return true;
  // "only the ones outdoors", "narrow it down to..." right after a search
  return previousWasSearch && text.length < 200 && /\b(only|just|ones|those|narrow|also|instead|without|but|more|fewer)\b/i.test(text);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cleanWord = w => String(w || '').toLowerCase().replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();

export function sanitizeConcepts(raw) {
  const out = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const label = String(c?.label || c?.words?.[0] || '').trim().slice(0, 40);
    const words = [...new Set((Array.isArray(c?.words) ? c.words : []).map(cleanWord).filter(w => w.length >= 2))].slice(0, MAX_WORDS_PER_CONCEPT);
    if (label && words.length) out.push({ label, words, required: c?.required !== false });
    if (out.length >= MAX_CONCEPTS) break;
  }
  // At least one concept has to be searchable in tags, or there is nothing to scan with
  if (out.length && !out.some(c => c.required)) out.forEach(c => { c.required = true; });
  return out;
}

export function extractJson(text) {
  const s = String(text || '');
  const start = s.search(/[\[{]/);
  if (start < 0) return null;
  for (let end = s.length; end > start; end--) {
    const ch = s[end - 1];
    if (ch !== '}' && ch !== ']') continue;
    try { return JSON.parse(s.slice(start, end)); } catch { /* keep shrinking */ }
  }
  return null;
}

let vocabCache = { at: 0, text: '' };
async function tagVocabulary() {
  if (Date.now() - vocabCache.at < 10 * 60 * 1000 && vocabCache.text) return vocabCache.text;
  const { data, error } = await supabase.from('tags').select('name').gt('usage_count', 0).order('usage_count', { ascending: false }).limit(1500);
  if (error) throw error;
  const text = [...new Set((data || []).map(t => t.name.toLowerCase()))].join(', ');
  vocabCache = { at: Date.now(), text };
  return text;
}

// Indirection so tests can stand in for the AI providers
export const llm = {
  chatComplete: (...args) => aiProviders.chatComplete(...args),
  visionComplete: (...args) => aiProviders.visionComplete(...args),
};

async function chat(userId, system, user, maxTokens) {
  return llm.chatComplete(userId, [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, task: CHAT_TASK });
}

// ─── 1. Understand ────────────────────────────────────────────────────────────

const UNDERSTAND_SYSTEM = `You turn a content creator's request into a search over their photo/video library. Every asset in the library is described ONLY by short tags (for example "camo pants", "plaid shirt", "brown", "floral", "mirror selfie", "outfit of the day").

Decide whether the user is asking to find photos/videos/assets. If they are not (analytics, captions, planning, general chat), answer {"is_search": false}.

If they are, split the request into 2-6 CONCEPTS — one per distinct garment, color, pattern, setting, person/pose or other visual attribute. An asset must match EVERY concept, so keep concepts independent and don't invent constraints the user didn't state. For each concept give 3-12 "words": the label itself plus synonyms/variants, plus any matching entries from the TAG VOCABULARY. Words are matched as whole words against the tags, so use the words that would actually appear in a tag (e.g. "camo", "camouflage"; "trousers", "pants"). Prefer words from the vocabulary. For a garment with a modifier ("camo pants", "floral shirt") list the compound phrases ("camo pants", "camouflage pants") and add the modifier alone only if it is distinctive. Don't include words that would also match unrelated things.

Mark each concept "required": true if the tag vocabulary can express it (there are tags like "floral print", "camo pants", "shirt"). Mark it "required": false if the vocabulary can't express it reliably — typically a specific color shade or subtle detail (e.g. "cream" when there is no cream tag, only white/neutral). Non-required concepts are checked by looking at the photo, and their words are used only to rank, so make them generous (cream → cream, ivory, off white, beige, white, neutral). Always keep at least one required concept.

If the user is refining an earlier search ("only the ones outdoors"), return the COMBINED concept list (previous + new) and set refines_previous true.

Reply with JSON only:
{"is_search": true, "summary": "<the request in a short phrase>", "media_type": "image"|"video"|null, "refines_previous": false, "concepts": [{"label": "floral print", "words": ["floral print","floral","flower"], "required": true}, {"label": "cream", "words": ["cream","ivory","off white","beige","white","neutral"], "required": false}]}`;

export async function understandRequest(userId, message, { history = [], previous = null } = {}) {
  const vocab = await tagVocabulary();
  const recent = history.slice(-4).map(m => `${m.role}: ${String(m.content).slice(0, 300)}`).join('\n');
  const user = [
    `TAG VOCABULARY: ${vocab}`,
    previous ? `PREVIOUS SEARCH: ${previous.summary} — concepts: ${JSON.stringify(previous.concepts)}` : '',
    recent ? `RECENT CONVERSATION:\n${recent}` : '',
    `USER REQUEST: ${message}`,
  ].filter(Boolean).join('\n\n');
  const text = await chat(userId, UNDERSTAND_SYSTEM, user, 900);
  if (text == null) return null; // no chat provider configured
  const parsed = extractJson(text);
  if (!parsed || !parsed.is_search) return { is_search: false };
  const concepts = sanitizeConcepts(parsed.concepts);
  if (!concepts.length) return { is_search: false };
  return {
    is_search: true,
    summary: String(parsed.summary || message).slice(0, 160),
    media_type: parsed.media_type === 'video' || parsed.media_type === 'image' ? parsed.media_type : null,
    concepts,
  };
}

// ─── 2. Scan ──────────────────────────────────────────────────────────────────

async function scan(concepts, minHits) {
  const { data, error } = await supabase.rpc('search_media_concepts', {
    concepts: concepts.map(c => c.words),
    min_hits: minHits,
    max_results: SCAN_LIMIT,
  });
  if (error) throw error;
  return data || [];
}

/** Everything hitting all required concepts; if that's thin, widen to assets missing one, then two, and so on. */
export async function scanLibrary(allConcepts) {
  const concepts = allConcepts.filter(c => c.required !== false);
  const n = concepts.length;
  let rows = await scan(concepts, n);
  const exactCount = Number(rows[0]?.total_matches || 0);
  let relaxedTo = n;
  // Widen only as far as needed. With real exact matches, a 1-or-2-concept search stays
  // exact (dropping one of two concepts would flood the results); longer requests may
  // drop down to half their concepts. With no exact matches at all, go as wide as it takes.
  const floor = rows.length ? (n >= 3 ? Math.ceil(n / 2) : n) : 1;
  for (let minHits = n - 1; minHits >= floor && rows.length < MIN_GOOD_RESULTS; minHits--) {
    rows = await scan(concepts, minHits);
    relaxedTo = minHits;
  }
  const total = Number(rows[0]?.total_matches || 0);
  return {
    requiredCount: n,
    exactCount: relaxedTo === n ? total : exactCount,
    total,
    relaxedTo,
    candidates: rows.map(r => ({
      id: r.media_id,
      hits: r.hits,
      missing: concepts.filter((_, i) => !r.hit_flags?.[i]).map(c => c.label),
    })),
  };
}

const wordRegex = w => new RegExp(`\\b${cleanWord(w).replace(/-/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?\\b`);
/** How many of the soft (non-required) concepts an asset's tags happen to mention — ranking only. */
const softHits = (doc, softPatterns) => softPatterns.reduce((n, pats) => n + (pats.some(re => re.test(doc || '')) ? 1 : 0), 0);

async function loadAssets(ids) {
  const byId = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase
      .from('media_assets')
      .select('id, title, file_type, file_url, thumbnail_url, search_text, ai_quality_score, created_at')
      .in('id', ids.slice(i, i + 50));
    if (error) throw error;
    (data || []).forEach(a => byId.set(a.id, a));
  }
  return byId;
}

// ─── 3. Sanity-check candidates from their tags ───────────────────────────────

const TEXT_CHECK_SYSTEM = `You verify search results for a creator's photo library. Each numbered item is one photo described only by its tags (the first words are a meaningless file title). Decide whether the photo plausibly shows what the user asked for.

- "exact": the tags support every part of the request.
- "close": most parts are supported but one is missing or doubtful.
- "no": a key part is missing, or a tag is being misread (e.g. "cream" as a skincare product when the tags say Skincare, "top" in "Top Performer", "brown" as hair color when the request is about clothing and no clothing is tagged brown).
Judge only from the tags. Reply with JSON only: [{"n": 1, "verdict": "exact"}, ...] covering every item.`;

async function textCheck(userId, request, items) {
  const verdicts = new Map();
  const batches = [];
  for (let i = 0; i < items.length; i += TEXT_CHECK_BATCH) batches.push(items.slice(i, i + TEXT_CHECK_BATCH));
  let nextBatch = 0;
  const worker = async () => { while (nextBatch < batches.length) {
    const batch = batches[nextBatch++];
    const listing = batch.map((it, i) => `${i + 1}. ${it.doc}`).join('\n');
    const text = await chat(userId, TEXT_CHECK_SYSTEM, `REQUEST: ${request}\n\nITEMS:\n${listing}`, 1500);
    const parsed = extractJson(text);
    if (!Array.isArray(parsed)) throw new Error('unreadable text-check reply');
    for (const v of parsed) {
      const it = batch[Number(v?.n) - 1];
      if (it && ['exact', 'close', 'no'].includes(v.verdict)) verdicts.set(it.id, v.verdict);
    }
  } };
  await Promise.all(Array.from({ length: Math.min(TEXT_CONCURRENCY, batches.length) }, worker));
  return verdicts;
}

// ─── 4. Look at the photos ────────────────────────────────────────────────────

const VISION_SYSTEM = `You verify search results for a fashion creator's photo library by LOOKING at the photos. You are given a request and several numbered photos (in order). For each photo say whether it truly shows what was asked: every garment/color/pattern/setting mentioned, and — importantly — that attributes belong to the right item (a cream shirt with floral print worn WITH camo pants is not a cream pair of pants and a floral shirt).
- "yes": clearly matches everything.
- "partial": matches some parts, or you can't tell for one part.
- "no": doesn't match.
Reply with JSON only: [{"n": 1, "match": "yes", "seen": "<6-12 words on what is visible>"}, ...] covering every photo.`;

async function visionCheck(userId, request, items) {
  const results = new Map();
  const batches = [];
  for (let i = 0; i < items.length; i += VISION_BATCH) batches.push(items.slice(i, i + VISION_BATCH));
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const { text } = await llm.visionComplete(userId, {
          systemPrompt: VISION_SYSTEM,
          userText: `REQUEST: ${request}\n\nThere are ${batch.length} photos, in order 1-${batch.length}.`,
          imageUrls: batch.map(b => b.image),
          maxTokens: 900,
          temperature: 0.1,
          task: VISION_TASK,
        });
        const parsed = extractJson(text);
        if (!Array.isArray(parsed)) throw new Error('unreadable vision reply');
        for (const v of parsed) {
          const it = batch[Number(v?.n) - 1];
          if (it && ['yes', 'partial', 'no'].includes(v.match)) results.set(it.id, { match: v.match, seen: String(v.seen || '').slice(0, 140) });
        }
      } catch (err) {
        failed += 1;
        console.warn('Media search vision batch failed:', err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(VISION_CONCURRENCY, batches.length) }, worker));
  return { results, failed };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

const toCard = (asset, extra) => ({
  id: asset.id,
  title: asset.title,
  file_type: asset.file_type,
  thumbnail_url: asset.thumbnail_url || asset.file_url || null,
  file_url: asset.file_url || null,
  ...extra,
});

/**
 * Runs the funnel for an already-understood request.
 * Returns { content, search } where `search` is stored on the chat message for rendering.
 */
export async function runMediaSearch(userId, understood, { log = () => {} } = {}) {
  const { concepts, summary, media_type: mediaType } = understood;
  const required = concepts.filter(c => c.required !== false);
  const soft = concepts.filter(c => c.required === false);
  const labels = required.map(c => c.label);
  const t0 = Date.now();

  const scanned = await scanLibrary(concepts);
  log('scan', { ms: Date.now() - t0, total: scanned.total, relaxedTo: scanned.relaxedTo, of: scanned.requiredCount });

  const { count: librarySize } = await supabase
    .from('media_assets').select('id', { count: 'exact', head: true }).eq('is_archived', false).is('parent_asset_id', null);
  const libraryText = librarySize ? `all ${librarySize.toLocaleString()} assets` : 'every asset';
  const base = { summary, concepts: concepts.map(c => c.label), concept_words: concepts, library_size: librarySize || null };

  if (!scanned.candidates.length) {
    return {
      content: `I scanned ${libraryText} and nothing is tagged with ${labels.length > 1 ? 'those details' : labels[0]} (${labels.join(', ')}). Try different wording, or check the Tag Manager for what's tagged.`,
      search: { ...base, total_matches: 0, results: [] },
    };
  }

  const assets = await loadAssets(scanned.candidates.map(c => c.id));
  const softPatterns = soft.map(c => c.words.map(wordRegex));
  let pool = scanned.candidates
    .map((c, i) => ({ ...c, order: i, asset: assets.get(c.id) }))
    .filter(c => c.asset && (!mediaType || c.asset.file_type === mediaType))
    .map(c => ({ ...c, soft: softHits(c.asset.search_text, softPatterns) }))
    // best tag match first; among equals, the ones whose tags also hint at the soft details
    .sort((a, b) => b.hits - a.hits || b.soft - a.soft || a.order - b.order);

  // Stage 3: tags sanity check (judges only the tag-expressible concepts)
  let textChecked = true;
  try {
    const items = pool.slice(0, TEXT_CHECK_MAX).map(c => ({ id: c.id, doc: c.asset.search_text || '' }));
    const verdicts = await textCheck(userId, labels.join(' + '), items);
    const rank = { exact: 0, close: 1 };
    pool = pool
      .filter(c => verdicts.get(c.id) !== 'no')
      .map(c => ({ ...c, tagVerdict: verdicts.get(c.id) || null }))
      .sort((a, b) => (rank[a.tagVerdict] ?? 1) - (rank[b.tagVerdict] ?? 1) || b.hits - a.hits || b.soft - a.soft || a.order - b.order);
    log('textCheck', { ms: Date.now() - t0, kept: pool.length });
  } catch (err) {
    textChecked = false;
    console.warn('Media search text check failed:', err.message);
  }

  // Stage 4: look at the best photos, a round at a time, until a few clear matches turn up
  const lookable = pool.filter(c => c.asset.file_type === 'image' && c.asset.thumbnail_url);
  const visionResults = new Map();
  let visionFailedBatches = 0;
  let visionUnavailable = false;
  let looked = 0;
  for (let round = 0; round < MAX_VISION_ROUNDS && looked < lookable.length && !visionUnavailable; round++) {
    const slice = lookable.slice(looked, looked + VISION_MAX);
    looked += slice.length;
    try {
      const v = await visionCheck(userId, summary, slice.map(c => ({ id: c.id, image: c.asset.thumbnail_url })));
      v.results.forEach((val, id) => visionResults.set(id, val));
      visionFailedBatches += v.failed;
      if (!v.results.size) visionUnavailable = true;
    } catch (err) {
      visionUnavailable = true;
      console.warn('Media search vision step unavailable:', err.message);
    }
    log('vision', { ms: Date.now() - t0, round, looked, answered: visionResults.size });
    if ([...visionResults.values()].filter(r => r.match === 'yes').length >= ENOUGH_CONFIRMED) break;
  }
  const visionDone = visionResults.size > 0;
  const lookedIds = new Set(lookable.slice(0, looked).map(c => c.id));

  const order = { yes: 0, partial: 1 };
  const ranked = pool
    .map(c => {
      const v = visionResults.get(c.id);
      if (v?.match === 'no') return null;
      // Candidates the vision pass looked at but couldn't answer for stay as tag matches
      const confidence = v ? (v.match === 'yes' ? 'confirmed' : 'partial') : (c.hits === scanned.requiredCount ? 'tags' : 'near');
      const sort = v ? order[v.match] : (visionDone && lookedIds.has(c.id) ? 3 : 2);
      return { c, v, confidence, sort };
    })
    .filter(Boolean)
    .sort((a, b) => a.sort - b.sort || b.c.hits - a.c.hits || b.c.soft - a.c.soft || a.c.order - b.c.order);

  const shown = ranked.slice(0, MAX_RESULTS_SHOWN);
  const confirmed = ranked.filter(r => r.confidence === 'confirmed').length;
  const partial = ranked.filter(r => r.confidence === 'partial').length;

  const results = shown.map(({ c, v, confidence }) => toCard(c.asset, {
    confidence,
    hits: c.hits,
    missing: c.missing,
    seen: v?.seen || null,
  }));

  const lines = [];
  lines.push(`I scanned ${libraryText} for tags matching **${labels.join(' + ')}**${soft.length ? ` and then checked the photos for **${soft.map(c => c.label).join(' + ')}**` : ''}.`);
  if (scanned.relaxedTo === scanned.requiredCount) {
    lines.push(`**${scanned.total.toLocaleString()}** ${scanned.total === 1 ? 'asset has' : 'assets have'} tags for every part${mediaType ? ` (${mediaType}s only)` : ''}.`);
  } else {
    lines.push(`${scanned.exactCount ? `Only **${scanned.exactCount}** ${scanned.exactCount === 1 ? 'is' : 'are'}` : 'None are'} tagged for every part, so I widened it to assets missing a detail (each shows what's missing).`);
  }
  if (visionDone) {
    lines.push(`I looked at ${looked > 1 ? `${looked} of the best photos` : 'the best photo'}: **${confirmed}** clearly match${partial ? `, ${partial} partly` : ''}.${visionFailedBatches ? " (A few photos couldn't be checked.)" : ''}`);
  } else if (lookable.length) {
    lines.push("I couldn't view the photos right now, so these are matched on tags only — they may need a quick look.");
  }
  if (!textChecked && !visionDone) lines.push('(Results are ranked by tag matches only.)');
  if (ranked.length > shown.length) lines.push(`Showing the best ${shown.length} of ${ranked.length}. Add a detail (a setting, a pose, an accessory) and I'll narrow it down.`);
  if (!results.length) lines.push("None survived the closer check — tell me what to loosen and I'll try again.");

  return { content: lines.join('\n'), search: { ...base, total_matches: scanned.total, results } };
}
