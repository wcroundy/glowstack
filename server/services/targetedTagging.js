import { supabase } from './supabase.js';
import * as aiProviders from './aiProviders.js';

// Targeted auto-tagging: check every asset for a handful of chosen tags (typically ones
// created since the library was last tagged). With only a few tags in play, several
// photos fit in one vision call, so a full-library pass costs a fraction of a normal run.

export const MAX_TARGET_TAGS = 25;
const PHOTOS_PER_CALL = 8;

const SYSTEM_PROMPT = `You check photos from a fashion/beauty content creator's media library for specific tags.
Each tag comes with its name and, when given, a definition written by the creator saying exactly what it means for them. Definitions can describe things you could not guess from the name (a specific product, person, place, outfit or brand detail) — follow them exactly, and when a definition says what does NOT count, respect that.
Apply a tag only when the photo clearly shows it. Don't stretch a tag to near-misses.
Reply with JSON only, one entry per photo, in order: [{"n": 1, "tags": ["Tag Name"]}, {"n": 2, "tags": []}]`;

export function describeTags(tags) {
  return tags.map(t => `- ${t.name}${t.ai_instructions ? `: ${t.ai_instructions}` : ''}`).join('\n');
}

function parseReply(text, count) {
  const s = String(text || '');
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(arr) ? arr.filter(e => Number(e?.n) >= 1 && Number(e.n) <= count) : null;
  } catch { return null; }
}

/**
 * One batch of a targeted run: assets [offset, offset+limit) in a stable order (oldest
 * first), checked against `tagIds`. Matches are saved as each group finishes, so on an
 * error the thrown err.partial reports real progress and the next offset to resume from.
 */
export async function tagAssetsForTags(userId, { tagIds, limit, offset = 0 }) {
  const ids = [...new Set((tagIds || []).filter(id => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, MAX_TARGET_TAGS);
  const { data: tags, error: tagErr } = await supabase.from('tags').select('id, name, ai_instructions').in('id', ids);
  if (tagErr) throw tagErr;
  if (!tags?.length) return { tagged: 0, totalAssetsProcessed: 0, totalImagesAnalyzed: 0, totalNewTags: 0, batchComplete: true, nextOffset: offset, message: 'None of those tags exist any more.' };

  const { data: assets, error: assetErr } = await supabase
    .from('media_assets')
    .select('id, thumbnail_url, file_url, file_type')
    .eq('is_archived', false)
    .is('parent_asset_id', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (assetErr) throw assetErr;

  const byName = new Map(tags.map(t => [t.name.toLowerCase(), t]));
  const tagList = describeTags(tags);
  const progress = { processed: 0, tagged: 0, applied: 0, images: 0 };

  for (let i = 0; i < (assets || []).length; i += PHOTOS_PER_CALL) {
    const group = assets.slice(i, i + PHOTOS_PER_CALL);
    const lookable = group.filter(a => a.thumbnail_url || a.file_url);
    if (lookable.length) {
      let parsed = null;
      try {
        for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
          const { text } = await aiProviders.visionComplete(userId, {
            systemPrompt: SYSTEM_PROMPT,
            userText: `TAGS:\n${tagList}\n\nThere are ${lookable.length} photos, in order 1-${lookable.length}.`,
            imageUrls: lookable.map(a => a.thumbnail_url || a.file_url),
            maxTokens: 120 + lookable.length * 60,
            temperature: 0.1,
            task: 'auto_tag',
          });
          parsed = parseReply(text, lookable.length);
        }
      } catch (err) {
        err.partial = { totalAssetsProcessed: progress.processed, tagged: progress.tagged, totalNewTags: progress.applied, nextOffset: offset + progress.processed };
        throw err;
      }
      progress.images += lookable.length;

      const rows = [];
      for (const entry of parsed || []) {
        const asset = lookable[Number(entry.n) - 1];
        const matched = (Array.isArray(entry.tags) ? entry.tags : [])
          .map(name => byName.get(String(name).toLowerCase().trim()))
          .filter(Boolean);
        for (const tag of new Set(matched)) rows.push({ media_id: asset.id, tag_id: tag.id, is_ai_assigned: true, confidence: 0.8 });
      }
      if (rows.length) {
        const { error } = await supabase.from('media_tags').upsert(rows, { onConflict: 'media_id,tag_id' });
        if (error) console.error('Targeted tag insert error:', error.message);
        else {
          progress.tagged += new Set(rows.map(r => r.media_id)).size;
          progress.applied += rows.length;
        }
      }
    }
    progress.processed += group.length;
  }

  return {
    tagged: progress.tagged,
    totalAssetsProcessed: progress.processed,
    totalImagesAnalyzed: progress.images,
    totalNewTags: progress.applied,
    aiPowered: true,
    suggestedTags: [],
    batchComplete: (assets || []).length < limit,
    nextOffset: offset + progress.processed,
    message: `Checked ${progress.processed} assets for ${tags.length} tag${tags.length === 1 ? '' : 's'} and applied ${progress.applied} tags`,
  };
}
