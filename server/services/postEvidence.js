const COLUMNS = 'id,platform,platform_post_id,post_url,post_type,caption,published_at,views,reach,likes,comments,shares,saves,clicks,revenue,conversions,metrics_refresh';
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'what', 'content', 'post', 'posts', 'ideas', 'about', 'would', 'please', 'want']);
export function focusTerms(focus) {
  return [...new Set((focus.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w)))].slice(0, 8);
}
export function freshness(sync, now = Date.now()) {
  const timestamp = Date.parse(sync?.last_synced_at);
  const known = Number.isFinite(timestamp) && timestamp <= now;
  return {
    last_synced_at: known ? new Date(timestamp).toISOString() : null,
    freshness: !known ? 'unknown' : now - timestamp > 48 * 3600000 ? 'stale' : 'recent',
    detailed_metrics_available: !!sync?.raw_insights && Object.keys(sync.raw_insights).length > 0,
  };
}

// Separate cohorts prevent recent posts on one platform crowding out older evidence.
// Rankings are retrieval signals, never an equal-age test or a causal success claim.
export async function collectPostEvidence(db, userId, focus = '', now = Date.now()) {
  const documents = [], gaps = [], coverage = [];
  const terms = focusTerms(focus);
  const cutoff = new Date(now - 30 * 86400000).toISOString();
  for (const platform of ['instagram', 'facebook']) {
    const base = () => db.from('posts').select(COLUMNS).eq('user_id', userId).eq('platform', platform).eq('status', 'published');
    const queries = [
      ['recent', base().order('published_at', { ascending: false, nullsFirst: false }).order('id').limit(15)],
      ...['views', 'reach', 'shares', ...(platform === 'instagram' ? ['saves'] : ['clicks'])].map(metric => [
        `historical_${metric}`, base().lt('published_at', cutoff).gt(metric, 0).order(metric, { ascending: false, nullsFirst: false }).order('id').limit(5),
      ]),
    ];
    if (terms.length) queries.push(['focus_matches', base().or(terms.map(w => `caption.ilike.%${w}%`).join(',')).order('published_at', { ascending: false, nullsFirst: false }).order('id').limit(15)]);
    const results = await Promise.allSettled(queries.map(([, query]) => query));
    const posts = new Map(), counts = {};
    results.forEach((result, index) => {
      const reason = queries[index][0];
      if (result.status === 'rejected' || result.value.error) { counts[reason] = null; gaps.push(`${platform}: ${reason} unavailable.`); return; }
      const rows = result.value.data || [];
      counts[reason] = rows.length;
      for (const row of rows) {
        const existing = posts.get(row.id);
        if (existing) existing.selected_for.push(reason);
        else posts.set(row.id, { ...row, caption: (row.caption || '').slice(0, 650), selected_for: [reason] });
      }
    });
    const ids = [...posts.values()].map(p => p.platform_post_id).filter(Boolean);
    const key = platform === 'instagram' ? 'ig_media_id' : 'fb_post_id';
    let synced = [];
    if (ids.length) {
      try {
        const result = await db.from(`${platform}_insights`).select(`${key},last_synced_at,raw_insights`).eq('user_id', userId).in(key, ids);
        if (result.error) throw result.error;
        synced = result.data || [];
      } catch { gaps.push(`${platform}: per-post sync timestamps and metric availability could not be read.`); }
    }
    const byId = new Map(synced.map(s => [s[key], s]));
    const selected = [...posts.values()].map(p => {
      const sync = byId.get(p.platform_post_id);
      const refresh = p.metrics_refresh;
      if (!refresh?.last_success_at || Date.parse(sync?.last_synced_at) > Date.parse(refresh.last_success_at)) return { ...p, ...freshness(sync, now) };
      return { ...p, ...freshness({ last_synced_at:refresh.last_success_at, raw_insights:refresh.field_dates }, now),
        metric_field_dates:refresh.field_dates, metric_warning:'Only fields with recorded dates were verified by targeted refresh. Other values may be older or unmeasured; this refresh does not measure revenue/conversions.' };
    });
    const stamps = selected.map(p => p.last_synced_at).filter(Boolean).sort();
    const summary = { platform, selected_posts: selected.length, cohorts: counts, focus_terms: terms,
      oldest_refresh: stamps[0] || null, newest_refresh: stamps.at(-1) || null,
      stale_posts: selected.filter(p => p.freshness === 'stale').length,
      unknown_refresh: selected.filter(p => p.freshness === 'unknown').length,
      missing_detailed_metrics: selected.filter(p => !p.detailed_metrics_available).length };
    coverage.push(summary);
    if (!selected.length) gaps.push(`${platform}: no published post evidence retrieved.`);
    if (summary.stale_posts || summary.unknown_refresh) gaps.push(`${platform}: ${summary.stale_posts} selected posts last refreshed over 48 hours ago; ${summary.unknown_refresh} have unknown refresh times.`);
    if (summary.missing_detailed_metrics) gaps.push(`${platform}: ${summary.missing_detailed_metrics} selected posts lack verified detailed insights. Zero defaults are not evidence of zero performance.`);
    // One source per post avoids silently truncating an entire platform cohort.
    for (const post of selected) documents.push({ id: `app-post-${post.id}`, title: `${platform} ${post.post_type || 'post'} · ${post.published_at || 'date unknown'}`,
      source: `Glowstack/posts/${post.id}`, category: 'performance', captured_at: new Date(now).toISOString(), metrics_refreshed_at: post.last_synced_at, freshness: post.freshness,
      content: JSON.stringify(post), excerpted: false });
  }
  return { documents, gaps, coverage };
}
