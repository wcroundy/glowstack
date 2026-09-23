import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { normalizeTrendResponse, trendRequest, validateTrendSettings, publicTrendState, saveTrendSettings, refreshTrend, trendStatus, disconnectTrend, generalTrendEvidence } from '../server/services/trendProviders.js';
import { updateLocal } from '../server/services/contentKnowledge.js';
import { isSupabaseConfigured } from '../server/services/supabase.js';

const now=Date.now();
const settings={mode:'get_top_trends',feed:'TikTok Trending Hashtags',topic:'fashion',source:'google search'};
const feed={as_of_ts:'2026-09-17T12:00:00Z',data:[[1,'fall outfits'],[2,'skin tint']]};
const response=body=>({ok:true,text:async()=>JSON.stringify(body)});
test('provider requests use fixed hosts and headers; input cannot choose endpoints',()=>{
  const r=trendRequest('socialcrawl',{mode:'search',topic:'beauty & fashion',region:'US'},'secret');
  assert.equal(new URL(r.url).searchParams.get('query'),'beauty & fashion');
  assert.ok(!r.url.includes('secret'));assert.equal(r.options.headers['x-api-key'],'secret');
  const t=trendRequest('trendsapi',{...settings,mode:'get_growth'},'secret');
  assert.equal(t.url,'https://api.trendsapi.ai/api');
  assert.deepEqual(JSON.parse(t.options.body).window,['7D','30D']);
  assert.throws(()=>validateTrendSettings('unknown',{}));
  assert.throws(()=>validateTrendSettings('trendsapi',{...settings,feed:'unverified feed'}));
});
test('TrendsAPI wrapped application errors are errors even under HTTP 200',()=>{
  assert.throws(()=>normalizeTrendResponse('trendsapi',{statusCode:401,body:'{"error":"invalid_key"}'},settings));
  const parsed=normalizeTrendResponse('trendsapi',{statusCode:200,body:JSON.stringify(feed)},settings,now);
  assert.equal(parsed.items[0].topic,'fall outfits');assert.equal(parsed.as_of,feed.as_of_ts);
  assert.equal(parsed.fetched_at,new Date(now).toISOString());
});
test('growth preserves explicit zero, nulls and measurement windows',()=>{
  const s=normalizeTrendResponse('trendsapi',{results:[{period:'7D',growth:0,recent_date:'2026-09-17',baseline_date:'2026-09-10',recent_value:50,baseline_value:50}]},{...settings,mode:'get_growth'},now);
  assert.equal(s.items[0].growth,0);assert.equal(s.items[0].baseline_date,'2026-09-10');
});
test('SocialCrawl snapshots omit media, preserve unknowns and surface partial data',()=>{
  const s=normalizeTrendResponse('socialcrawl',{success:true,credits_used:1,cached:true,pagination:{has_more:true},data:{dropped:1,_warnings:['partial'],items:[{post:{id:'x',text:'An outfit',url:'https://www.tiktok.com/@creator/video/123',media:[{url:'secret-media'}],metrics:{likes:0,views:null}}}] }},{mode:'search',topic:'fashion',region:'US'},now);
  assert.equal(s.items[0].metrics.likes,0);assert.equal(s.items[0].metrics.views,null);
  assert.ok(!JSON.stringify(s).includes('secret-media'));assert.equal(s.warnings.length,3);
  assert.throws(()=>normalizeTrendResponse('socialcrawl',{success:true,data:{items:[]}},{mode:'search'}));
});
test('public connection status excludes credentials',()=>{
  const output=publicTrendState('trendsapi',{api_key:'secret-key',settings,snapshot:null});
  assert.equal(output.configured,true);assert.ok(!JSON.stringify(output).includes('secret-key'));
});
test('refresh persists evidence, caches calls, retains failures and isolates users', {skip:isSupabaseConfigured()},async()=>{
  const user=`trend-provider-test-${randomUUID()}`;
  const key='test-key-not-a-live-credential';
  let calls=0;
  const fetcher=async()=>{calls++;return response({statusCode:200,body:JSON.stringify(feed)});};
  try {
    const saved=await saveTrendSettings(user,'trendsapi',{settings,apiKey:key});
    assert.ok(!JSON.stringify(saved).includes(key));
    const first=await refreshTrend(user,'trendsapi',fetcher,now);
    await saveTrendSettings(user,'trendsapi',{settings});
    assert.equal((await refreshTrend(user,'trendsapi',fetcher,now+1000)).reused,true);
    assert.equal(calls,1);
    assert.equal((await generalTrendEvidence(user,now)).documents.length,1);
    assert.equal((await generalTrendEvidence(`${user}-other`,now)).documents.length,0);
    await assert.rejects(refreshTrend(user,'trendsapi',async()=>{throw new Error(key);},now+7*3600000),e=>!e.message.includes(key));
    const state=(await trendStatus(user)).find(p=>p.provider==='trendsapi');
    assert.deepEqual(state.snapshot,first.snapshot);assert.ok(state.last_error);
    assert.equal((await generalTrendEvidence(user,now+8*86400000)).documents.length,0);
    await disconnectTrend(user,'trendsapi');
    assert.equal((await generalTrendEvidence(user,now)).documents.length,0);
  }finally{await updateLocal(user,'trend-providers',()=>[]);}
});
