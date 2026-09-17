import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRefresh, metricPatch, createGraphReader, runTargetedRefresh } from '../server/services/targetedRefresh.js';
const now=Date.parse('2026-09-20T12:00:00Z');
const post=(id,extra={})=>({id,platform:'instagram',platform_post_id:id,user_id:'u',published_at:'2026-09-19T00:00:00Z',reach:100,saves:20,...extra});
test('refresh selects stale recent and old candidates with separate quotas',()=>{
  const all=[...Array.from({length:20},(_,i)=>post(String(i))),...Array.from({length:20},(_,i)=>post(`old${i}`,{published_at:'2023-01-01T00:00:00Z'}))];
  const selected=chooseRefresh(all,now);
  assert.equal(selected.length,15);
  assert.equal(selected.filter(p=>p.id.startsWith('old')).length,5);
  assert.deepEqual(chooseRefresh([post('fresh',{last_synced_at:'2026-09-20T10:00:00Z'}),post('cooldown',{metrics_refresh:{attempted_at:'2026-09-20T11:59:00Z'}})],now),[]);
  assert.equal(chooseRefresh([post('old',{published_at:'2023-01-01',last_synced_at:'2026-09-19T00:00:00Z'})],now).length,0);
});
test('only observed finite values update metrics; explicit zero is preserved',()=>{
  assert.deepEqual(metricPatch('instagram',{data:[{name:'reach',values:[{value:0}]},{name:'saved',values:[]},{name:'views',values:[{value:'123'}]}]}),{reach:0});
  assert.deepEqual(metricPatch('facebook',{data:[{name:'post_media_view',values:[{value:99}]},{name:'post_clicks',total_value:{value:3}}]}),{views:99,clicks:3});
});
test('graph client stops after rate limiting, excludes token from URL/errors',async()=>{
  let calls=0;
  const read=createGraphReader('private-token',{fetcher:async(url,options)=>{
    calls++; assert.ok(!url.href.includes('private-token'));assert.equal(options.headers.Authorization,'Bearer private-token');
    return {ok:false,status:429,json:async()=>({error:{code:4,message:'private-token'}})};
  }});
  await assert.rejects(read('123/insights',{}),/Meta request unavailable \(4\)/);
  await assert.rejects(read('123/insights',{}),/paused/);
  assert.equal(calls,1);
});
function mockDb(rows) {
  return {from(table){assert.equal(table,'posts');let patch,insert,filters=[];const q={
    upsert(value){insert=value;return q;},update(value){patch=value;return q;},eq(k,v){filters.push([k,v]);return q;},
    then(resolve,reject){if(insert) for(const r of insert) {if(!rows.some(p=>p.platform===r.platform&&p.platform_post_id===r.platform_post_id&&p.user_id===r.user_id))rows.push({...r,id:r.platform_post_id});}
      if(patch)rows.filter(r=>filters.every(([k,v])=>r[k]===v)).forEach(r=>Object.assign(r,patch));return Promise.resolve({error:null}).then(resolve,reject);}
  };return q;}};
}
const collect=async(db,userId)=>({documents:db.rows.filter(p=>p.user_id===userId).map(p=>({content:JSON.stringify(p)})),gaps:[]});
test('failed insights retain values and successful timestamps; another user remains unchanged',async()=>{
  const prior={last_success_at:'2026-09-01T00:00:00Z',field_dates:{reach:'2026-09-01T00:00:00Z'}};
  const rows=[post('123',{metrics_refresh:prior}),post('456',{user_id:'other'})];const db=mockDb(rows);db.rows=rows;
  const receipt=await runTargetedRefresh({db,userId:'u',connection:{ig_user_id:'99'},now,collect,readGraph:async(path)=>{
    if(path.endsWith('/media'))return {data:[]};throw new Error('Unavailable');
  }});
  assert.equal(receipt.failed,1);assert.equal(rows[0].reach,100);assert.equal(rows[0].saves,20);
  assert.equal(rows[0].metrics_refresh.last_success_at,prior.last_success_at);assert.equal(rows[0].metrics_refresh.status,'failed');assert.equal(rows[1].metrics_refresh,undefined);
});
test('partial insight success preserves absent metrics and records exact refreshed fields',async()=>{
  const rows=[post('123')];const db=mockDb(rows);db.rows=rows;
  const receipt=await runTargetedRefresh({db,userId:'u',connection:{ig_user_id:'99'},now,collect,readGraph:async(path)=>path.endsWith('/media')?{data:[]}:{data:[{name:'reach',values:[{value:200}]}]}});
  assert.equal(receipt.refreshed,1);assert.equal(rows[0].reach,200);assert.equal(rows[0].saves,20);
  assert.deepEqual(rows[0].metrics_refresh.available_fields,['reach']);assert.equal(rows[0].metrics_refresh.field_dates.saves,undefined);
});
test('discovery is capped, requests no media fields, and never overwrites saved metrics',async()=>{
  const rows=[post('123')];const db=mockDb(rows);db.rows=rows;let pages=0;
  const receipt=await runTargetedRefresh({db,userId:'u',connection:{ig_user_id:'99'},now,collect:async()=>({documents:[],gaps:[]}),readGraph:async(path,params)=>{
    pages++;assert.ok(!/thumbnail|media_url|picture/.test(params.fields));return {data:[{id:'123',timestamp:'2026-09-19',like_count:0}],paging:{next:'ignored-untrusted-url',cursors:{after:'cursor'}}};
  }});
  assert.equal(pages,2);assert.equal(rows[0].reach,100);assert.equal(receipt.platforms[0].limited,true);
});
