import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { collectPostEvidence } from './postEvidence.js';

export const CATEGORIES = ['strategy', 'performance', 'sales', 'reuse', 'products', 'schedule', 'opportunities', 'coverage'];
const root = join(process.cwd(), '.local', 'content');
const filename = (userId, kind) => join(root, `${createHash('sha256').update(userId).digest('hex')}-${kind}.json`);
// Serialize local writes, including read/modify/write draft operations.
let queue = Promise.resolve();
export async function readLocal(userId, kind) {
  try { return JSON.parse(await readFile(filename(userId, kind), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
export function updateLocal(userId, kind, change) {
  const next = queue.then(async () => {
    const result = await change(await readLocal(userId, kind));
    await mkdir(root, { recursive: true });
    const target = filename(userId, kind);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(result, null, 2));
    await rename(temporary, target);
    return result;
  });
  queue = next.catch(() => {});
  return next;
}
export function validateDocuments(documents) {
  if (!Array.isArray(documents) || !documents.length || documents.length > 250) throw new Error('Import 1–250 source documents at a time.');
  let size = 0;
  const result = documents.map(d => {
    if (!d || typeof d !== 'object') throw new Error('Invalid source document.');
    for (const key of ['title', 'source', 'content']) {
      if (typeof d[key] !== 'string' || !d[key].trim()) throw new Error(`Each source needs ${key}.`);
    }
    if (d.title.length > 250 || d.source.length > 500 || d.content.length > 200000) throw new Error('A source exceeds its size limit.');
    if (!CATEGORIES.includes(d.category) || !Number.isFinite(Date.parse(d.captured_at))) throw new Error('Each source needs a category and valid capture date.');
    size += d.content.length;
    return { id: createHash('sha256').update(d.source).digest('hex'), title: d.title, source: d.source,
      category: d.category, content: d.content, captured_at: new Date(d.captured_at).toISOString(), imported_at: new Date().toISOString() };
  });
  if (size > 3000000) throw new Error('Import is too large (3 million characters maximum).');
  return result;
}
export async function getKnowledge(userId) {
  if (!isSupabaseConfigured()) {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new Error('Configure private database storage before importing knowledge.');
    return readLocal(userId, 'knowledge');
  }
  const { data, error } = await supabase.from('content_knowledge').select('*').eq('user_id', userId).order('imported_at', { ascending: false }).limit(1000);
  if (error) throw new Error('Knowledge storage unavailable. Apply migration 019 and configure the server service-role key.');
  return data;
}
export async function importKnowledge(userId, input) {
  const documents = validateDocuments(input);
  if (!isSupabaseConfigured()) {
    await getKnowledge(userId); // reject ephemeral production storage
    await updateLocal(userId, 'knowledge', rows => {
      const map = new Map(rows.map(d => [d.id, d]));
      documents.forEach(d => map.set(d.id, d));
      return [...map.values()];
    });
  } else {
    const { error } = await supabase.from('content_knowledge').upsert(documents.map(d => ({ ...d, user_id: userId })), { onConflict: 'user_id,id' });
    if (error) throw new Error('Import failed. Check migration 019 and the server service-role key.');
  }
  return documents.length;
}

// Read bounded, user-scoped snapshots already stored by Glowstack. Never use demo metrics.
export async function getAppEvidence(userId, focus = '') {
  if (!isSupabaseConfigured()) return { documents: [], coverage: [], gaps: ['Live Glowstack database is not configured. Only imported snapshots are available.'] };
  const specs = [
    ['media_assets', 'products', 'Available media assets', 'id,title,file_type,ai_description,ai_tags,created_at', 'created_at'],
    ['calendar_events', 'schedule', 'Upcoming content commitments', 'id,title,description,platform,start_at,status', 'start_at'],
  ];
  const { documents, gaps, coverage } = await collectPostEvidence(supabase, userId, focus);
  for (const [table, category, title, columns, order] of specs) {
    let query = supabase.from(table).select(columns).eq('user_id', userId);
    if (table === 'media_assets') query = query.eq('is_archived', false);
    if (table === 'calendar_events') query = query.gte('start_at', new Date().toISOString());
    const { data, error } = await query.order(order, { ascending: table === 'calendar_events', nullsFirst: false }).limit(15);
    if (error || !data?.length) { gaps.push(`${title}: ${error ? 'unavailable' : 'no records'}.`); continue; }
    documents.push({ id: `app-${table}`, title, source: `Glowstack/${table}`, category, captured_at: new Date().toISOString(),
      content: 'Stored database snapshot, up to 15 rows. Capture time is query time, not a platform refresh. Zero defaults may be unmeasured. Revenue field definitions and attribution require verification.\n' + JSON.stringify(data) });
  }
  return { documents, gaps, coverage };
}
