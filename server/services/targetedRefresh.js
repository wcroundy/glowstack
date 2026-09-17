import { supabase, isSupabaseConfigured } from './supabase.js';
import { getStoredConnection } from './meta.js';
import { collectPostEvidence } from './postEvidence.js';

const GRAPH = 'https://graph.facebook.com/v22.0';
const active = new Map();
const recent = new Map();
const METRICS = {
  instagram: { views: 'views', reach: 'reach', saved: 'saves', shares: 'shares', likes: 'likes', comments: 'comments' },
  facebook: { post_media_view: 'views', post_clicks: 'clicks' },
};
// Preserve exact metric names: views are not impressions and clicks are not sales.
export function metricPatch(platform, response) {
  const patch = {};
  for (const metric of response?.data || []) {
    const field = METRICS[platform][metric.name];
    const value = metric.values?.[0]?.value ?? metric.total_value?.value;
    if (field && typeof value === 'number' && Number.isFinite(value) && value >= 0) patch[field] = value;
  }
  return patch;
}
export function chooseRefresh(posts, now = Date.now()) {
  const eligible = posts.filter(p => {
    const times = [p.metrics_refresh?.last_success_at, p.last_synced_at].map(Date.parse).filter(t => Number.isFinite(t) && t <= now);
    const last = times.length ? Math.max(...times) : NaN;
    const attempt = Date.parse(p.metrics_refresh?.attempted_at);
    const isRecent = now - Date.parse(p.published_at) < 30 * 86400000;
    return p.platform_post_id && !(attempt <= now && now - attempt < 5 * 60000)
      && (!Number.isFinite(last) || last > now || now - last > (isRecent ? 6 : 48) * 3600000);
  });
  const ordered = eligible.sort((a,b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));
  return [...ordered.filter(p => now - Date.parse(p.published_at) < 30 * 86400000).slice(0,10),
    ...ordered.filter(p => !(now - Date.parse(p.published_at) < 30 * 86400000)).slice(0,5)];
}
export function createGraphReader(token, { fetcher = fetch, deadline = Date.now() + 60000 } = {}) {
  let stopped = false;
  return async (path, params) => {
    if (stopped || Date.now() >= deadline) throw new Error('Refresh paused: time or API limit reached.');
    const url = new URL(`${GRAPH}/${path}`);
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now()))) });
    const body = await response.json();
    if (!response.ok || body.error) {
      const code = body.error?.code;
      if (response.status === 429 || [4,17,32,613,190].includes(code)) stopped = true;
      // Never return provider text that might contain credentials or request URLs.
      throw new Error(code === 190 ? 'Meta connection needs reauthentication.' : `Meta request unavailable (${code || response.status}). Saved metrics retained.`);
    }
    return body;
  };
}

export async function runTargetedRefresh({ db, connection, focus = '', userId, now = Date.now(), readGraph, collect = collectPostEvidence }) {
  const report = { started_at: new Date(now).toISOString(), discovered: 0, refreshed: 0, not_refreshed: 0, failed: 0, gaps: [], platforms: [] };
  for (const platform of ['instagram','facebook']) {
    const account = platform === 'instagram' ? connection.ig_user_id : connection.page_id;
    if (!account || !/^[0-9_]+$/.test(account)) { report.gaps.push(`${platform}: account not connected.`); continue; }
    const discovery = { platform, listed: 0, limited: false };
    try {
      const fields = platform === 'instagram' ? 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count' : 'id,message,permalink_url,created_time';
      // Two newest pages only. This is intentionally not a full-history sync.
      let after;
      for (let page=0; page<2; page++) {
        const batch = await readGraph(`${account}/${platform === 'instagram' ? 'media' : 'posts'}`, { fields, limit:25, ...(after ? { after } : {}) });
        const rows = (batch.data || []).filter(p => /^[0-9_]+$/.test(p.id)).map(p => ({ user_id:userId, platform, platform_post_id:p.id, status:'published',
          caption: p.caption ?? p.message ?? '', post_url:p.permalink ?? p.permalink_url ?? null,
          published_at:p.timestamp ?? p.created_time ?? null, post_type:(p.media_product_type || p.media_type || 'post').toLowerCase(),
          ...(typeof p.like_count === 'number' ? {likes:p.like_count} : {}), ...(typeof p.comments_count === 'number' ? {comments:p.comments_count} : {}) }));
        if (rows.length) {
          // Existing posts are deliberately untouched until the metric refresh succeeds.
          const { error } = await db.from('posts').upsert(rows, { onConflict:'platform,platform_post_id,user_id', ignoreDuplicates:true });
          if (error) throw new Error('Could not save discovered posts. Check database migrations.');
        }
        discovery.listed += rows.length;
        after = batch.paging?.next ? batch.paging?.cursors?.after : null;
        if (!after) break;
        if (page===1) discovery.limited = true;
      }
      report.discovered += discovery.listed;
      if (discovery.limited) report.gaps.push(`${platform}: discovery capped at 50 recent posts; use the existing full sync for backlog.`);
    } catch (e) { report.gaps.push(`${platform}: ${e.message}`); }
    report.platforms.push(discovery);
  }
  const evidence = await collect(db,userId,focus,now);
  report.gaps.push(...evidence.gaps.filter(g=>g.includes('unavailable')));
  const posts = evidence.documents.map(d=>JSON.parse(d.content));
  for (const platform of ['instagram','facebook']) {
    const candidates = chooseRefresh(posts.filter(p=>p.platform===platform),now);
    report.not_refreshed += posts.filter(p=>p.platform===platform).length - candidates.length;
    // Three bounded workers. No unbounded full-history insight loop or retries.
    let index=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(index<candidates.length) {
        const p=candidates[index++];
        const previous=p.metrics_refresh || {};
        const stamp=new Date().toISOString();
        try {
          if (!/^[0-9_]+$/.test(p.platform_post_id)) throw new Error('Invalid stored post identifier.');
          const data=await readGraph(`${p.platform_post_id}/insights`,{ metric:Object.keys(METRICS[platform]).join(',') });
          const patch=metricPatch(platform,data);
          if (!Object.keys(patch).length) throw new Error('No supported insight values returned. Saved metrics retained.');
          const missing=Object.values(METRICS[platform]).filter(field=>!(field in patch));
          const state={ attempted_at:stamp, last_success_at:stamp, field_dates:{...previous.field_dates,...Object.fromEntries(Object.keys(patch).map(k=>[k,stamp]))}, available_fields:Object.keys(patch), status:'updated' };
          const { error }=await db.from('posts').update({...patch,metrics_refresh:state}).eq('user_id',userId).eq('id',p.id);
          if(error) throw new Error('Could not save refreshed metrics. Check database migration 019.');
          report.refreshed++;
          if(missing.length) report.gaps.push(`${platform} post ${p.platform_post_id}: ${missing.join(', ')} not returned; older values retained, not freshly verified.`);
        } catch(e) {
          report.failed++;
          report.gaps.push(`${platform} post ${p.platform_post_id}: ${e.message}`);
          // Retain successful timestamps and all prior metric values on failure.
          const {error}=await db.from('posts').update({metrics_refresh:{...previous,attempted_at:stamp,status:'failed'}}).eq('user_id',userId).eq('id',p.id);
          if(error) report.gaps.push(`${platform}: refresh failure receipt could not be stored.`);
        }
      }
    }));
  }
  report.completed_at=new Date().toISOString();
  report.status=report.gaps.length ? 'partial' : 'completed';
  return report;
}

export async function refreshForIdeas(userId,focus='') {
  if (!isSupabaseConfigured()) return {status:'unavailable',gaps:['Live database is not configured; no Meta refresh ran.']};
  if(active.has(userId)) return active.get(userId);
  const cached=recent.get(userId);
  if(cached && cached.focus===focus && Date.now()-cached.time<5*60000) return {...cached.result,reused:true};
  const work=(async()=>{
    const conn=await getStoredConnection(userId);
    if(!conn?.is_connected || !conn.metadata?.page_access_token || conn.metadata.needs_reauth) return {status:'unavailable',gaps:['Meta is disconnected or needs reauthentication; saved evidence will be used.']};
    return runTargetedRefresh({db:supabase,userId,focus,connection:conn.metadata,readGraph:createGraphReader(conn.metadata.page_access_token)});
  })().catch(()=>({status:'unavailable',gaps:['Meta refresh could not complete; saved evidence will be used.']}));
  active.set(userId,work);
  try { const result=await work; recent.set(userId,{time:Date.now(),focus,result}); return result; }
  finally {active.delete(userId);}
}
