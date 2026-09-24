import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { readLocal, updateLocal } from './contentKnowledge.js';

export const bridgeError = (message, code = 'ai_mcp_unavailable') => Object.assign(new Error(message), { code, provider: 'codex' });
const hash = token => createHash('sha256').update(token).digest('hex');
function localAllowed() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw bridgeError('Configure Supabase and apply migration 021 for the MCP worker.');
}
async function connection(userId) {
  if (!isSupabaseConfigured()) { localAllowed(); return (await readLocal(userId, 'ai-bridge'))[0] || null; }
  const { data, error } = await supabase.from('ai_bridge_connections').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw bridgeError('MCP storage unavailable. Apply migration 021.');
  return data;
}
async function saveConnection(userId, value) {
  if (!isSupabaseConfigured()) { localAllowed(); await updateLocal(userId, 'ai-bridge', () => value ? [value] : []); return; }
  const query = value ? supabase.from('ai_bridge_connections').upsert(value) : supabase.from('ai_bridge_connections').delete().eq('user_id', userId);
  const { error } = await query;
  if (error) throw bridgeError('Could not save MCP pairing. Apply migration 021.');
}
export async function bridgeStatus(userId) {
  const c = await connection(userId);
  return { paired: !!c, online: !!c?.last_seen && Date.now() - Date.parse(c.last_seen) < 45000, lastSeen: c?.last_seen || null, model: c?.model || null };
}
export async function pairBridge(userId) {
  // User id is an identifier, not a credential. The random secret is shown once.
  const token = `${Buffer.from(userId).toString('base64url')}.${randomBytes(32).toString('base64url')}`;
  await saveConnection(userId, { user_id: userId, token_hash: hash(token), last_seen: null, model: null });
  return { token };
}
export const disconnectBridge = userId => saveConnection(userId, null);
export async function authenticateBridge(token) {
  if (typeof token !== 'string' || token.length > 600 || !/^[\w-]+\.[\w-]{43}$/.test(token)) return null;
  const userId = Buffer.from(token.split('.')[0], 'base64url').toString();
  const c = await connection(userId);
  return c?.token_hash === hash(token) ? c : null;
}
export async function heartbeatBridge(c, model) {
  const last_seen = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    await updateLocal(c.user_id, 'ai-bridge', rows => rows.map(r => r.token_hash === c.token_hash ? { ...r, last_seen, model } : r));
  } else {
    const { error } = await supabase.from('ai_bridge_connections').update({ last_seen, model }).eq('user_id', c.user_id).eq('token_hash', c.token_hash);
    if (error) throw bridgeError('Worker heartbeat failed.');
  }
  return { ok: true };
}
async function jobs(userId) {
  if (!isSupabaseConfigured()) return readLocal(userId, 'ai-jobs');
  // Poll metadata/results only. Image payloads can be large and should cross the
  // database boundary once, when a worker atomically claims their job.
  const { data, error } = await supabase.from('ai_bridge_jobs').select('id,user_id,token_hash,status,claim_token,expires_at,created_at,result').eq('user_id', userId).gt('expires_at', new Date().toISOString()).order('created_at').limit(20);
  if (error) throw bridgeError('Could not read MCP jobs.');
  return data;
}
async function changeJob(userId, id, expected, patch, claimToken) {
  let changed = null;
  if (!isSupabaseConfigured()) {
    await updateLocal(userId, 'ai-jobs', rows => rows.map(r => {
      if (r.id !== id || r.status !== expected || (claimToken && r.claim_token !== claimToken)) return r;
      changed = { ...r, ...patch }; return changed;
    }));
  } else {
    let query = supabase.from('ai_bridge_jobs').update(patch).eq('user_id', userId).eq('id', id).eq('status', expected);
    if (claimToken) query = query.eq('claim_token', claimToken);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw bridgeError('Could not update MCP job.');
    changed = data;
  }
  return changed;
}
export async function claimBridgeJob(c) {
  const pending = (await jobs(c.user_id)).filter(j => j.status === 'pending' && j.token_hash === c.token_hash && Date.parse(j.expires_at) > Date.now());
  for (const j of pending) {
    const claimed = await changeJob(c.user_id, j.id, 'pending', { status: 'running', claim_token: randomUUID() });
    if (claimed) return { id: claimed.id, claimToken: claimed.claim_token, expiresAt: claimed.expires_at, payload: claimed.payload };
  }
  return null;
}
export async function finishBridgeJob(c, { id, claimToken, text, error, totalTokens }) {
  const j = (await jobs(c.user_id)).find(r => r.id === id && r.token_hash === c.token_hash);
  if (!j || Date.parse(j.expires_at) <= Date.now()) throw bridgeError('Job expired or unavailable.');
  const result = error ? { error } : { text, usage: { totalTokens: totalTokens ?? 0 } };
  const changed = await changeJob(c.user_id, id, 'running', { status: error ? 'failed' : 'completed', result, payload: null }, claimToken);
  if (!changed) throw bridgeError('Job already finished or claimed by another worker.');
  return { ok: true };
}
export async function bridgeComplete(userId, payload, { timeoutMs = 90000, pollMs = 1000 } = {}) {
  const c = await connection(userId);
  if (!c?.last_seen || Date.now() - Date.parse(c.last_seen) > 45000) throw bridgeError('MCP worker is offline. Start the paired worker or switch this engine to API in Integrations.');
  if (Buffer.byteLength(JSON.stringify(payload)) > 4000000) throw bridgeError('Media request is too large for the MCP worker (4 MB maximum). Use fewer video frames or switch Media Processing to API.');
  const active = (await jobs(userId)).filter(j => ['pending','running'].includes(j.status) && Date.parse(j.expires_at) > Date.now());
  if (active.length >= 4) throw bridgeError('MCP worker queue is full. Try again after the current jobs finish.');
  const job = { id: randomUUID(), user_id: userId, token_hash: c.token_hash, status: 'pending', payload, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + timeoutMs).toISOString() };
  if (!isSupabaseConfigured()) {
    await updateLocal(userId, 'ai-jobs', rows => [...rows.filter(r => Date.parse(r.expires_at) > Date.now()), job]);
  } else {
    const { error: cleanupError } = await supabase.from('ai_bridge_jobs').delete().eq('user_id', userId).lt('expires_at', new Date().toISOString());
    if (cleanupError) throw bridgeError('Could not clean up expired MCP jobs.');
    const { error } = await supabase.from('ai_bridge_jobs').insert(job);
    if (error) throw bridgeError('Could not queue MCP job.');
  }
  try {
    while (Date.now() < Date.parse(job.expires_at)) {
      await sleep(pollMs);
      if ((await connection(userId))?.token_hash !== c.token_hash) throw bridgeError('MCP worker was disconnected or paired again.');
      const current = (await jobs(userId)).find(j => j.id === job.id);
      if (current?.status === 'completed') return current.result;
      if (current?.status === 'failed') throw bridgeError(current.result.error, 'ai_mcp_failed');
    }
    throw bridgeError('MCP analysis timed out. No API fallback was used. Try a smaller batch or check the worker.', 'ai_mcp_timeout');
  } finally {
    // Remove sensitive prompts/images/results after delivery or failure.
    if (!isSupabaseConfigured()) await updateLocal(userId, 'ai-jobs', rows => rows.filter(j => j.id !== job.id));
    else await supabase.from('ai_bridge_jobs').delete().eq('user_id', userId).eq('id', job.id);
  }
}
