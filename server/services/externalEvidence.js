// Outside examples are discovery evidence, never proof of revenue or virality.
export function safeReferenceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function selectExternalExamples(sources, focus = '', now = Date.now()) {
  const terms = [...new Set(focus.toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
  const candidates = [], coverage = [];
  for (const source of sources) {
    let eligible = 0, stale = 0, undated = 0;
    const posts = source.posts || [];
    for (const post of posts) {
      const published = Date.parse(post.published_at), observed = Date.parse(post.synced_at);
      if (!Number.isFinite(published) || !Number.isFinite(observed) || published > now || observed > now) { undated++; continue; }
      if (now - published > 14 * 86400000 || now - observed > 7 * 86400000) { stale++; continue; }
      const url = safeReferenceUrl(post.post_url);
      if (!url) continue;
      eligible++;
      candidates.push({ ...post, url, origin: source.label, kind:source.kind, source_id:source.id,
        score:terms.reduce((sum,t)=>sum+((post.caption || '').toLowerCase().includes(t)?1:0),0) });
    }
    coverage.push({id:source.id,kind:source.kind,label:source.label,last_synced_at:source.last_synced_at,read_error:source.read_error || null,stored_sample:posts.length,eligible,stale,undated});
  }
  candidates.sort((a,b)=>b.score-a.score || Date.parse(b.published_at)-Date.parse(a.published_at));
  const picked = [], seen = new Map(), counts = new Map();
  for (const p of candidates) {
    const key = p.platform_post_id || p.url;
    if (seen.has(key)) { seen.get(key).origins.push(p.origin); continue; }
    if ((counts.get(p.source_id)||0)>=2 || picked.length>=12) continue;
    const row = { id:`external-${p.kind}-${p.id}`, title:`Outside example · ${p.origin}`, source:p.url, category:'opportunities',
      captured_at:p.synced_at, external:true, origin:p.origin, origins:[p.origin], published_at:p.published_at,
      caption:(p.caption || '').slice(0,1200), format:p.media_type || 'unknown',
      // Existing syncs default missing counters to zero. Do not elevate them to verified measurements.
      likes:p.likes,comments:p.comments, limitations:'Single stored observation; counters may contain missing-value defaults. No growth rate, equal-age creator baseline, sales, audience fit, rights, or community-wide trend verified.' };
    picked.push(row);seen.set(key,row);counts.set(p.source_id,(counts.get(p.source_id)||0)+1);
  }
  return {documents:picked.map(p=>({...p,content:JSON.stringify(p)})),coverage};
}

export async function collectExternalEvidence(db,userId,focus='',now=Date.now()) {
  // A watchlist outage must not discard the owner's performance evidence.
  const read = async query => { try { return await query; } catch (error) { return {data:null,error}; } };
  const sources=[],gaps=[];
  for (const kind of ['creator','hashtag']) {
    const table=kind==='creator'?'watched_influencers':'watched_hashtags';
    const child=kind==='creator'?'watched_posts':'hashtag_posts';
    const key=kind==='creator'?'watched_influencer_id':'watched_hashtag_id';
    const name=kind==='creator'?'username':'hashtag';
    const {data,error}=await read(db.from(table).select(`id,${name},last_synced_at`).eq('user_id',userId).eq('platform','instagram').order('last_synced_at',{ascending:false,nullsFirst:false}).limit(7));
    if(error) {gaps.push(`Outside ${kind} watchlist unavailable. Check migrations 017/018 and the connection.`);continue;}
    if(!data?.length)gaps.push(`No Instagram ${kind} watchlist configured.`);
    if(data?.length>6)gaps.push(`Only six ${kind} sources sampled for this recommendation; additional tracked sources were not reviewed.`);
    for(const source of (data||[]).slice(0,6)) {
      const {data:posts,error:postError}=await read(db.from(child).select('id,platform_post_id,post_url,caption,media_type,likes,comments,published_at,synced_at').eq(key,source.id).order('published_at',{ascending:false,nullsFirst:false}).limit(40));
      if(postError)gaps.push(`${kind} ${source[name]}: stored examples unavailable.`);
      sources.push({...source,kind,label:`${kind==='creator'?'@':'#'}${source[name]}`,posts:posts||[],read_error:postError?'Examples could not be read':null});
    }
  }
  const result=selectExternalExamples(sources,focus,now);
  if(!result.documents.length)gaps.push('No dated, recently observed outside examples qualified. Missing or stale evidence is not proof that nothing is trending.');
  return {...result,gaps};
}
