import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPostEvidence, freshness, focusTerms } from '../server/services/postEvidence.js';

const now = Date.parse('2026-09-20T12:00:00Z');
// In-memory query double applies filters, sorting and limits to real fixtures.
function database(tables, failures = []) {
  const calls = [];
  return { calls, from(table) {
    const filters = [], orders = []; let limit = Infinity;
    const call = { table, filters }; calls.push(call);
    const q = {
      select() { return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      lt(key, value) { filters.push(row => row[key] < value); return q; },
      gt(key, value) { filters.push(row => row[key] > value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      or(expression) { const terms = [...expression.matchAll(/caption\.ilike\.%([a-z0-9]+)%/g)].map(m => m[1]); filters.push(row => terms.some(t => row.caption?.toLowerCase().includes(t))); return q; },
      order(key, options = {}) { orders.push([key, options.ascending !== false]); return q; },
      limit(value) { limit = value; return q; },
      then(resolve, reject) {
        if (failures.includes(table)) return Promise.resolve({ data: null, error: new Error('unavailable') }).then(resolve, reject);
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)));
        rows.sort((a,b) => { for (const [key,asc] of orders) { const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (cmp) return asc ? cmp : -cmp; } return 0; });
        return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(resolve, reject);
      },
    }; return q;
  } };
}
const post = (id, platform, extra = {}) => ({ id, platform, platform_post_id: id, user_id: 'owner', status: 'published', published_at: '2026-09-19T12:00:00Z', caption: 'Beauty tutorial', reach: 10, shares: 1, saves: 1, clicks: 1, ...extra });
test('separate recent cohorts retain Facebook when Instagram has many newer posts', async () => {
  const db = database({ posts: [...Array.from({length:30},(_,i)=>post(`ig${i}`,'instagram')), post('fb','facebook'), post('other','facebook',{user_id:'other'})] });
  const result = await collectPostEvidence(db,'owner','',now);
  assert.equal(result.coverage[0].cohorts.recent,15);
  assert.equal(result.coverage[1].selected_posts,1);
  assert.ok(!result.documents.some(d=>d.id==='app-post-other'));
});
test('older performers and relevant low-volume posts survive and duplicates merge', async () => {
  const old = '2022-01-01T00:00:00Z';
  const rows = [...Array.from({length:20},(_,i)=>post(`new${i}`,'instagram')),post('winner','instagram',{published_at:old,reach:90000,shares:500,saves:800}),post('match','instagram',{published_at:old,caption:'Denim fit guide',reach:0,shares:0,saves:0})];
  const result = await collectPostEvidence(database({posts:rows}),'owner','denim',now);
  const winner = JSON.parse(result.documents.find(d=>d.id==='app-post-winner').content);
  assert.equal(winner.selected_for.length,3);
  assert.equal(result.documents.filter(d=>d.id==='app-post-winner').length,1);
  assert.ok(result.documents.some(d=>d.id==='app-post-match'));
});
test('freshness is per-post, not query time; missing insights and failures are visible', async () => {
  const rows = [post('a','instagram'),post('b','instagram'),post('c','facebook')];
  const db = database({posts:rows,instagram_insights:[{user_id:'owner',ig_media_id:'a',last_synced_at:'2026-09-10T12:00:00Z',raw_insights:{reach:10}}]},['facebook_insights']);
  const result = await collectPostEvidence(db,'owner','',now);
  assert.equal(result.coverage[0].stale_posts,1);
  assert.equal(result.coverage[0].unknown_refresh,1);
  assert.equal(result.coverage[1].unknown_refresh,1);
  assert.ok(result.gaps.some(g=>g.includes('could not be read')));
  assert.equal(freshness({last_synced_at:'2099-01-01'},now).freshness,'unknown');
  assert.equal(freshness({last_synced_at:'2026-09-20T10:00:00Z',raw_insights:{}},now).detailed_metrics_available,false);
});
test('focus filters discard query syntax and common words',()=>{
  assert.deepEqual(focusTerms('the denim,caption.eq.secret% denim'),['denim','caption','secret']);
});
