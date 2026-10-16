import { supabase } from './supabase.js';
import * as aiProviders from './aiProviders.js';
import { normalizeDateRange, todayIn, validTimeZone, describeRange } from './dateRange.js';

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
const ANCHOR_MAX = 120; // widest anchor concept worth looking at photo by photo
const ENOUGH_CONFIRMED = 3;
const VISION_BATCH = 6;
// The MCP worker queue holds at most 4 active jobs per user and the worker rejects (and
// stops on) any task name outside shared/aiModelPolicy.js, so stay well under the queue
// limit and reuse the existing 'chat' and 'auto_tag' tasks rather than inventing new ones.
const VISION_CONCURRENCY = 3;
const TEXT_CONCURRENCY = 2;
const CHAT_TASK = 'chat';
const VISION_TASK = 'auto_tag';
export const MAX_RESULTS_STORED = 60; // everything the Media Library page will show
const CHAT_PREVIEW = 12;              // thumbnails shown inline in the (small) chat

// ─── Intent ───────────────────────────────────────────────────────────────────

const SEARCH_VERB = /\b(find|show|search|look(?:ing)?\s+for|pull\s+up|get\s+me|do\s+i\s+have|any|which|where)\b/i;
const MEDIA_NOUN = /\b(photos?|pics?|pictures?|images?|videos?|clips?|shots?|selfies?|reels?|assets?|footage|media|wearing|wore|outfits?)\b/i;

/** Cheap gate so ordinary chat doesn't pay for the understanding call. */
export function looksLikeMediaSearch(message, { previousWasSearch = false } = {}) {
  const text = String(message || '');
  if (MEDIA_NOUN.test(text) && (SEARCH_VERB.test(text) || /\b(of|with|in|from|during|since|before|after|taken)\b/i.test(text))) return true;
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

DATES: photos have a date taken. If the request mentions a time ("from September 2025", "last summer", "in the last 2 weeks", "this year", "before 2024", "recently"), return "date_range": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "label": "short label"} using TODAY'S DATE given below; either bound may be null for open-ended ranges ("since March" → to null). Both bounds are inclusive local calendar days. Seasons are northern-hemisphere (summer = Jun 1–Aug 31); "last <season/month/year>" means the most recent complete one in the past; "recently" = the last 30 days. If no time is mentioned, "date_range": null. A request can be dates only ("photos from last October") — then "concepts" is an empty list.

If the user is refining an earlier search ("only the ones outdoors"), return the COMBINED concept list (previous + new) and set refines_previous true; keep the previous date_range unless they change it.

Reply with JSON only:
{"is_search": true, "summary": "<the request in a short phrase>", "media_type": "image"|"video"|null, "refines_previous": false, "date_range": null, "concepts": [{"label": "floral print", "words": ["floral print","floral","flower"], "required": true}, {"label": "cream", "words": ["cream","ivory","off white","beige","white","neutral"], "required": false}]}`;

let spanCache = { at: 0, text: '' };
async function librarySpan() {
  if (Date.now() - spanCache.at < 10 * 60 * 1000 && spanCache.text) return spanCache.text;
  const [oldest, newest] = await Promise.all([
    supabase.from('media_assets').select('captured_at').not('captured_at', 'is', null).order('captured_at', { ascending: true }).limit(1),
    supabase.from('media_assets').select('captured_at').not('captured_at', 'is', null).order('captured_at', { ascending: false }).limit(1),
  ]);
  const a = oldest.data?.[0]?.captured_at?.slice(0, 10);
  const b = newest.data?.[0]?.captured_at?.slice(0, 10);
  const text = a && b ? `Photos in the library were taken between ${a} and ${b}.` : '';
  spanCache = { at: Date.now(), text };
  return text;
}

export async function understandRequest(userId, message, { history = [], previous = null, tz = 'UTC' } = {}) {
  const zone = validTimeZone(tz);
  const [vocab, span] = await Promise.all([tagVocabulary(), librarySpan()]);
  const recent = history.slice(-4).map(m => `${m.role}: ${String(m.content).slice(0, 300)}`).join('\n');
  const user = [
    `TODAY'S DATE: ${todayIn(zone)} (time zone ${zone}). ${span}`,
    `TAG VOCABULARY: ${vocab}`,
    previous ? `PREVIOUS SEARCH: ${previous.summary} — concepts: ${JSON.stringify(previous.concepts)}${previous.date_range ? ` — date_range: ${JSON.stringify({ from: previous.date_range.from, to: previous.date_range.to, label: previous.date_range.label })}` : ''}` : '',
    recent ? `RECENT CONVERSATION:\n${recent}` : '',
    `USER REQUEST: ${message}`,
  ].filter(Boolean).join('\n\n');
  const text = await chat(userId, UNDERSTAND_SYSTEM, user, 900);
  if (text == null) return null; // no chat provider configured
  const parsed = extractJson(text);
  if (!parsed || !parsed.is_search) return { is_search: false };
  const concepts = sanitizeConcepts(parsed.concepts);
  const dateRange = normalizeDateRange(parsed.date_range, zone);
  if (!concepts.length && !dateRange) return { is_search: false };
  return {
    is_search: true,
    summary: String(parsed.summary || message).slice(0, 160),
    media_type: parsed.media_type === 'video' || parsed.media_type === 'image' ? parsed.media_type : null,
    concepts,
    date_range: dateRange,
  };
}

// ─── 2. Scan ──────────────────────────────────────────────────────────────────

async function scan(concepts, minHits, dateRange = null) {
  const { data, error } = await supabase.rpc('search_media_concepts', {
    concepts: concepts.map(c => c.words),
    min_hits: minHits,
    max_results: SCAN_LIMIT,
    ...(dateRange?.takenFrom ? { taken_from: dateRange.takenFrom } : {}),
    ...(dateRange?.takenTo ? { taken_to: dateRange.takenTo } : {}),
  });
  if (error) throw error;
  return data || [];
}

/** Everything hitting all required concepts; if that's thin, widen to assets missing one, then two, and so on. */
export async function scanLibrary(allConcepts, dateRange = null) {
  const concepts = allConcepts.filter(c => c.required !== false);
  const n = concepts.length;
  let rows = await scan(concepts, n, dateRange);
  const exactCount = Number(rows[0]?.total_matches || 0);
  let relaxedTo = n;
  // Widen only as far as needed. With real exact matches, a 1-or-2-concept search stays
  // exact (dropping one of two concepts would flood the results); longer requests may
  // drop down to half their concepts. With no exact matches at all, go as wide as it takes.
  const floor = rows.length ? (n >= 3 ? Math.ceil(n / 2) : n) : 1;
  for (let minHits = n - 1; minHits >= floor && rows.length < MIN_GOOD_RESULTS; minHits--) {
    rows = await scan(concepts, minHits, dateRange);
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
      .select('id, title, file_type, file_url, thumbnail_url, search_text, ai_quality_score, created_at, captured_at')
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
  taken_at: asset.captured_at || null,
  ...extra,
});

/** Looks at candidates a round at a time until a few clear matches turn up. */
async function visionRounds(userId, summary, lookable, { log, t0, results = new Map(), maxRounds = MAX_VISION_ROUNDS }) {
  const state = { results, failed: 0, unavailable: false, looked: 0 };
  for (let round = 0; round < maxRounds && state.looked < lookable.length && !state.unavailable; round++) {
    const slice = lookable.slice(state.looked, state.looked + VISION_MAX);
    state.looked += slice.length;
    try {
      const v = await visionCheck(userId, summary, slice.map(c => ({ id: c.id, image: c.asset.thumbnail_url })));
      v.results.forEach((val, id) => state.results.set(id, val));
      state.failed += v.failed;
      if (!v.results.size) state.unavailable = true;
    } catch (err) {
      state.unavailable = true;
      console.warn('Media search vision step unavailable:', err.message);
    }
    log('vision', { ms: Date.now() - t0, round, looked: state.looked, answered: state.results.size });
    if ([...state.results.values()].filter(r => r.match === 'yes').length >= ENOUGH_CONFIRMED) break;
  }
  return state;
}

/**
 * Last resort when no photo matches everything: take the rarest tag-expressible concept
 * (say "camo pants", 18 photos) and look at every photo carrying it, since the thing
 * actually being asked for may simply not have been tagged with the other concepts.
 */
async function anchorCandidates(required, excludeIds, mediaType, dateRange = null) {
  const counted = await Promise.all(required.map(async concept => {
    const rows = await scan([concept], 1, dateRange);
    return { concept, total: Number(rows[0]?.total_matches || 0), rows };
  }));
  const usable = counted.filter(c => c.total > 0 && c.total <= ANCHOR_MAX).sort((a, b) => a.total - b.total)[0];
  if (!usable) return null;
  const ids = usable.rows.map(r => r.media_id).filter(id => !excludeIds.has(id));
  if (!ids.length) return null;
  const assets = await loadAssets(ids);
  const pool = ids.map((id, order) => ({ id, order, hits: 1, missing: required.filter(c => c !== usable.concept).map(c => c.label), asset: assets.get(id) }))
    .filter(c => c.asset && c.asset.file_type === 'image' && c.asset.thumbnail_url && (!mediaType || c.asset.file_type === mediaType));
  return { concept: usable.concept, total: usable.total, pool };
}

/** Count of searchable assets, optionally within a date range. */
async function countAssets(dateRange, mediaType) {
  let q = supabase.from('media_assets').select('id', { count: 'exact', head: true }).eq('is_archived', false).is('parent_asset_id', null);
  if (dateRange?.takenFrom) q = q.gte('captured_at', dateRange.takenFrom);
  if (dateRange?.takenTo) q = q.lt('captured_at', dateRange.takenTo);
  if (mediaType) q = q.eq('file_type', mediaType);
  const { count } = await q;
  return count || 0;
}

/** A request that is only about when ("photos from last October"): list that window, newest first. */
async function dateOnlySearch(understood) {
  const { summary, media_type: mediaType, date_range: dateRange } = understood;
  let q = supabase
    .from('media_assets')
    .select('id, title, file_type, file_url, thumbnail_url, captured_at', { count: 'exact' })
    .eq('is_archived', false).is('parent_asset_id', null)
    .order('captured_at', { ascending: false }).limit(MAX_RESULTS_STORED);
  if (dateRange.takenFrom) q = q.gte('captured_at', dateRange.takenFrom);
  if (dateRange.takenTo) q = q.lt('captured_at', dateRange.takenTo);
  if (mediaType) q = q.eq('file_type', mediaType);
  const { data, count, error } = await q;
  if (error) throw error;
  const total = count || 0;
  const base = { summary, concepts: [], concept_words: [], date_range: { from: dateRange.from, to: dateRange.to, label: dateRange.label } };
  if (!total) {
    return { content: `I don't see any ${mediaType ? `${mediaType}s` : 'photos or videos'} taken **${dateRange.label}**.`, search: { ...base, total_matches: 0, results: [] } };
  }
  const results = (data || []).slice(0, CHAT_PREVIEW).map(a => toCard(a, { confidence: 'tags', hits: 0, missing: [], seen: a.captured_at ? new Date(a.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null }));
  const lines = [`**${total.toLocaleString()}** ${mediaType ? `${mediaType}s were` : 'assets were'} taken **${dateRange.label}**.`];
  if (total > (data || []).length) lines.push(`Showing the newest ${(data || []).length}. Tell me what's in them (an outfit, a setting, a color) and I'll narrow it down.`);
  return { content: lines.join('\n'), search: { ...base, total_matches: total, all_ids: (data || []).map(a => a.id), results } };
}

/**
 * Runs the funnel for an already-understood request.
 * Returns { content, search } where `search` is stored on the chat message for rendering.
 */
export async function runMediaSearch(userId, understood, { log = () => {} } = {}) {
  const { concepts, summary, media_type: mediaType, date_range: dateRange = null } = understood;
  if (!concepts.length) return dateOnlySearch(understood);
  const required = concepts.filter(c => c.required !== false);
  const soft = concepts.filter(c => c.required === false);
  const labels = required.map(c => c.label);
  const t0 = Date.now();

  const scanned = await scanLibrary(concepts, dateRange);
  log('scan', { ms: Date.now() - t0, total: scanned.total, relaxedTo: scanned.relaxedTo, of: scanned.requiredCount, dates: dateRange?.label || null });

  const librarySize = await countAssets(dateRange, null);
  const libraryText = dateRange
    ? `the ${librarySize.toLocaleString()} assets taken ${dateRange.label}`
    : (librarySize ? `all ${librarySize.toLocaleString()} assets` : 'every asset');
  const base = {
    summary, concepts: concepts.map(c => c.label), concept_words: concepts, library_size: librarySize || null,
    date_range: dateRange ? { from: dateRange.from, to: dateRange.to, label: dateRange.label } : null,
  };

  if (!scanned.candidates.length) {
    return {
      content: `I scanned ${libraryText} and nothing is tagged with ${labels.length > 1 ? 'those details' : labels[0]} (${labels.join(', ')}). ${dateRange ? 'Try a wider date range, or different wording.' : "Try different wording, or check the Tag Manager for what's tagged."}`,
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

  // Stage 3: tags sanity check (judges only the tag-expressible concepts). It exists to
  // catch false hits among assets tagged for everything ("cream" the skincare product);
  // widened candidates are missing a concept by design, so only the photos can judge those.
  let textChecked = scanned.relaxedTo === scanned.requiredCount;
  if (textChecked) {
    try {
      const items = pool.slice(0, TEXT_CHECK_MAX).map(c => ({ id: c.id, doc: c.asset.search_text || '' }));
      const verdicts = await textCheck(userId, labels.join(' + '), items);
      const rank = { exact: 0, close: 1 };
      const kept = pool.filter(c => verdicts.get(c.id) !== 'no');
      // Never let a strict read empty the pool — the photo check is the better judge
      pool = (kept.length ? kept : pool)
        .map(c => ({ ...c, tagVerdict: verdicts.get(c.id) || null }))
        .sort((a, b) => (rank[a.tagVerdict] ?? 1) - (rank[b.tagVerdict] ?? 1) || b.hits - a.hits || b.soft - a.soft || a.order - b.order);
      log('textCheck', { ms: Date.now() - t0, kept: kept.length, pool: pool.length });
    } catch (err) {
      textChecked = false;
      console.warn('Media search text check failed:', err.message);
    }
  }

  // Stage 4: look at the best photos, a round at a time, until a few clear matches turn up
  const lookable = pool.filter(c => c.asset.file_type === 'image' && c.asset.thumbnail_url);
  const vision = await visionRounds(userId, summary, lookable, { log, t0 });
  const visionResults = vision.results;
  let visionFailedBatches = vision.failed;
  let looked = vision.looked;
  const lookedIds = new Set(lookable.slice(0, looked).map(c => c.id));

  // Nothing clearly matched: also look at every photo carrying the rarest concept
  let anchorNote = null;
  if (visionResults.size && required.length > 1 && ![...visionResults.values()].some(r => r.match === 'yes')) {
    try {
      const anchor = await anchorCandidates(required, new Set(scanned.candidates.map(c => c.id)), mediaType, dateRange);
      if (anchor?.pool.length) {
        const more = await visionRounds(userId, summary, anchor.pool, { log, t0, results: visionResults });
        visionFailedBatches += more.failed;
        looked += more.looked;
        anchor.pool.slice(0, more.looked).forEach(c => lookedIds.add(c.id));
        pool = pool.concat(anchor.pool);
        anchorNote = { label: anchor.concept.label, total: anchor.total, looked: more.looked };
      }
    } catch (err) {
      console.warn('Media search anchor fallback failed:', err.message);
    }
  }
  const visionDone = visionResults.size > 0;

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

  const shown = ranked.slice(0, MAX_RESULTS_STORED);
  const confirmed = ranked.filter(r => r.confidence === 'confirmed').length;
  const partial = ranked.filter(r => r.confidence === 'partial').length;

  const results = shown.slice(0, CHAT_PREVIEW).map(({ c, v, confidence }) => toCard(c.asset, {
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
  if (anchorNote) {
    lines.push(`Nothing matched all of it, so I also looked through ${anchorNote.looked === anchorNote.total ? `all ${anchorNote.total}` : `${anchorNote.looked} more of the ${anchorNote.total}`} photos tagged **${anchorNote.label}** in case the rest just wasn't tagged.`);
  }
  if (ranked.length > shown.length) lines.push(`Showing the best ${shown.length} of ${ranked.length}. Add a detail (a setting, a pose, an accessory) and I'll narrow it down.`);
  else if (results.length) lines.push(`Showing all ${shown.length}, best matches first.`);
  if (!results.length) {
    const seen = [...new Set([...visionResults.values()].filter(r => r.match === 'no' && r.seen).map(r => r.seen))].slice(0, 3);
    lines.push(`None of the photos I checked actually match.${seen.length ? ` What I saw instead: ${seen.join('; ')}.` : ''} Tell me what to loosen (or describe it another way) and I'll try again.`);
  }

  return { content: lines.join('\n'), search: { ...base, total_matches: scanned.total, all_ids: shown.map(r => r.c.id), results } };
}
