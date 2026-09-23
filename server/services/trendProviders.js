import { createHash, randomUUID } from 'node:crypto';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { readLocal, updateLocal } from './contentKnowledge.js';
import { safeReferenceUrl } from './externalEvidence.js';

export const TREND_PROVIDERS = {
  socialcrawl: {name:'SocialCrawl',url:'https://www.socialcrawl.dev/docs',defaults:{mode:'search',topic:'fashion beauty',region:'US'}},
  trendsapi: {name:'TrendsAPI.ai',url:'https://trendsapi.ai/docs',defaults:{mode:'get_top_trends',feed:'TikTok Trending Hashtags',topic:'fashion',source:'google search'}},
};
export const TREND_FEEDS = ['TikTok Trending Hashtags','TikTok Trending Searches','Google Trends','YouTube Trending','Amazon Best Sellers Top Rated'];
export const TREND_SOURCES = ['google search','google shopping','tiktok','amazon','youtube'];
const locks = new Map();
export function validateTrendSettings(provider, input) {
  if (!TREND_PROVIDERS[provider]) throw new Error('Unknown trend provider.');
  const s={...TREND_PROVIDERS[provider].defaults,...input};
  if(typeof s.topic!=='string' || !s.topic.trim() || s.topic.length>120) throw new Error('Enter a topic of 1–120 characters.');
  if(provider==='socialcrawl') {
    if(!['search','trending'].includes(s.mode) || typeof s.region!=='string' || !/^[A-Z]{2}$/.test(s.region)) throw new Error('Choose search or trending and a two-letter region.');
    return {mode:s.mode,topic:s.topic.trim(),region:s.region};
  }
  if(!['get_top_trends','get_growth'].includes(s.mode) || !TREND_FEEDS.includes(s.feed) || !TREND_SOURCES.includes(s.source)) throw new Error('Choose a supported feed or keyword source.');
  return {mode:s.mode,topic:s.topic.trim(),feed:s.feed,source:s.source};
}
async function readState(userId,provider) {
  if(!isSupabaseConfigured()) {
    if(process.env.VERCEL || process.env.NODE_ENV==='production') throw new Error('Configure Supabase and apply migration 020 for trend connections.');
    return (await readLocal(userId,'trend-providers')).find(r=>r.provider===provider) || null;
  }
  const {data,error}=await supabase.from('trend_provider_state').select('*').eq('user_id',userId).eq('provider',provider).maybeSingle();
  if(error)throw new Error('Trend storage unavailable. Apply migration 020 and configure the server service-role key.');
  return data;
}
async function writeState(userId,provider,row) {
  const value={...row,user_id:userId,provider};
  if(!isSupabaseConfigured()) {
    await readState(userId,provider);
    return updateLocal(userId,'trend-providers',rows=>[...rows.filter(r=>r.provider!==provider),value]);
  }
  const {error}=await supabase.from('trend_provider_state').upsert(value,{onConflict:'user_id,provider'});
  if(error)throw new Error('Trend settings could not be saved. Check migration 020.');
}
export function publicTrendState(provider,row) {
  return {provider,...TREND_PROVIDERS[provider],configured:!!row?.api_key,settings:row?.settings || TREND_PROVIDERS[provider].defaults,
    snapshot:row?.snapshot || null,attempted_at:row?.attempted_at || null,last_error:row?.last_error || null};
}
export async function trendStatus(userId) {
  return Promise.all(Object.keys(TREND_PROVIDERS).map(async provider=>publicTrendState(provider,await readState(userId,provider))));
}
async function exclusive(userId,provider,action) {
  const key=JSON.stringify([userId,provider]);
  if(locks.has(key))throw new Error('This provider is busy. Wait for the current operation to finish.');
  locks.set(key,true);
  try{return await action();}finally{locks.delete(key);}
}
export async function saveTrendSettings(userId,provider,{settings,apiKey}) {
  const clean=validateTrendSettings(provider,settings);
  if(apiKey!==undefined && (typeof apiKey!=='string' || !apiKey.trim() || apiKey.length>2048 || /[\r\n]/.test(apiKey)))throw new Error('Enter a valid API key.');
  return exclusive(userId,provider,async()=>{
    const row=await readState(userId,provider);
    if(row && JSON.stringify(row.settings)===JSON.stringify(clean) && (!apiKey || apiKey.trim()===row.api_key))return publicTrendState(provider,row);
    const next={api_key:apiKey?.trim() || row?.api_key || null,settings:clean,snapshot:null,attempted_at:null,last_error:null};
    await writeState(userId,provider,next);
    return publicTrendState(provider,next);
  });
}
export async function disconnectTrend(userId,provider) {
  if(!TREND_PROVIDERS[provider])throw new Error('Unknown trend provider.');
  return exclusive(userId,provider,()=>writeState(userId,provider,{api_key:null,settings:TREND_PROVIDERS[provider].defaults,snapshot:null,attempted_at:null,last_error:null}));
}
export function trendRequest(provider,settings,apiKey) {
  const s=validateTrendSettings(provider,settings);
  if(provider==='socialcrawl') {
    const url=new URL(`https://www.socialcrawl.dev/v1/tiktok/${s.mode}`);
    url.searchParams.set('region',s.region);
    if(s.mode==='search')url.searchParams.set('query',s.topic);
    else url.searchParams.set('feed','local');
    return {url:url.href,options:{headers:{'x-api-key':apiKey,'Idempotency-Key':randomUUID()}}};
  }
  const body=s.mode==='get_top_trends'?{mode:s.mode,type:s.feed,limit:10}:{mode:s.mode,source:s.source,keyword:s.topic,window:['7D','30D']};
  return {url:'https://api.trendsapi.ai/api',options:{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body)}};
}
const short = value => typeof value==='string'?value.slice(0,1200):null;
const number = value => typeof value==='number' && Number.isFinite(value)?value:null;
export function normalizeTrendResponse(provider,raw,settings,now=Date.now()) {
  if(provider==='trendsapi' && raw && Object.hasOwn(raw,'statusCode')) {
    if(Number(raw.statusCode)!==200)throw new Error('TrendsAPI.ai rejected the request. Check the key, quota and selected source.');
    try {raw=typeof raw.body==='string'?JSON.parse(raw.body):raw.body;} catch {throw new Error('TrendsAPI.ai returned an unreadable response.');}
  }
  let items, warnings=[],asOf=null,credits=null,cached=null;
  if(provider==='socialcrawl') {
    if(raw?.success!==true)throw new Error('SocialCrawl rejected the request. Check the key, credits and availability.');
    if(!Array.isArray(raw.data?.items))throw new Error('SocialCrawl returned an unsupported response shape.');
    items=raw.data.items.slice(0,12).map(row=>{
      const p=row.post || row;
      const metrics={};
      for(const [key,value] of Object.entries(p.metrics || p.stats || {}))if(/^[a-z_]{1,40}$/i.test(key))metrics[key]=number(value);
      for(const key of ['views','likes','comments','shares','views_count','likes_count','comments_count','shares_count'])if(Object.hasOwn(p,key))metrics[key]=number(p[key]);
      return {id:short(p.id),text:short(p.text || p.caption || p.description),url:safeReferenceUrl(p.url || p.permalink),published_at:short(p.created_at || p.published_at || p.timestamp),metrics};
    }).filter(p=>p.text || p.url);
    warnings=(raw.data._warnings || []).filter(v=>typeof v==='string').slice(0,5).map(short);
    if(raw.pagination?.has_more)warnings.push('Only the first page was sampled.');
    if(raw.data.dropped)warnings.push('Provider omitted some upstream rows.');
    credits=number(raw.credits_used);cached=typeof raw.cached==='boolean'?raw.cached:null;
  } else if(settings.mode==='get_top_trends') {
    if(!Array.isArray(raw?.data))throw new Error('TrendsAPI.ai returned an unsupported feed shape.');
    items=raw.data.slice(0,10).filter(r=>Array.isArray(r)&&typeof r[1]==='string').map(r=>({rank:number(r[0]),topic:short(r[1])}));
    asOf=short(raw.as_of_ts);
  } else {
    if(!Array.isArray(raw?.results))throw new Error('TrendsAPI.ai returned an unsupported growth shape.');
    items=raw.results.slice(0,4).map(r=>({period:short(r.period),growth:number(r.growth),direction:short(r.direction),recent_date:short(r.recent_date),baseline_date:short(r.baseline_date),recent_value:number(r.recent_value),baseline_value:number(r.baseline_value)}));
  }
  if(!items.length)throw new Error('No usable evidence returned. Previous evidence was retained.');
  return {fetched_at:new Date(now).toISOString(),as_of:asOf,items,warnings,credits_used:credits,provider_cached:cached,settings,
    limitations:'Secondary outside evidence. Retrieval time is not publication or measurement time. Search results and rankings do not establish acceleration or sales. Growth is provider-reported for its stated window; demand indices are not sales. Broad feeds may be unrelated to fashion or beauty. Do not infer geography beyond the request or copy content.'};
}
export async function refreshTrend(userId,provider,fetcher=fetch,now=Date.now()) {
  if(!TREND_PROVIDERS[provider])throw new Error('Unknown trend provider.');
  return exclusive(userId,provider,async()=>{
    const row=await readState(userId,provider);
    if(!row?.api_key)throw new Error('Save this provider’s API key first.');
    if(row.snapshot && now-Date.parse(row.snapshot.fetched_at)<6*3600000)return {...publicTrendState(provider,row),reused:true};
    if(row.attempted_at && now-Date.parse(row.attempted_at)<5*60000)throw new Error('Please wait five minutes between unsuccessful refresh attempts.');
    const next={...row,attempted_at:new Date(now).toISOString()};
    await writeState(userId,provider,next);
    try {
      const request=trendRequest(provider,row.settings,row.api_key);
      const response=await fetcher(request.url,{...request.options,redirect:'error',signal:AbortSignal.timeout(55000)});
      if(!response.ok)throw new Error('Provider request failed.');
      const text=await response.text();
      if(text.length>2000000)throw new Error('Response too large.');
      const snapshot=normalizeTrendResponse(provider,JSON.parse(text),row.settings,now);
      // Never persist a provider response containing an echoed credential.
      if(JSON.stringify(snapshot).includes(row.api_key))throw new Error('Unexpected provider response.');
      next.snapshot=snapshot;next.last_error=null;
    } catch {
      next.last_error='Refresh failed or returned no usable data. Check your API key, quota and source. Previous evidence is unchanged.';
      await writeState(userId,provider,next);
      throw new Error(next.last_error);
    }
    await writeState(userId,provider,next);
    return publicTrendState(provider,next);
  });
}
export async function generalTrendEvidence(userId,now=Date.now()) {
  const documents=[],gaps=[];
  let states;
  try {states=await trendStatus(userId);} catch {return {documents,gaps:['General trend provider storage unavailable; SocialCrawl/TrendsAPI.ai evidence was not reviewed.']};}
  for(const state of states) {
    if(!state.configured)continue;
    const snapshot=state.snapshot;
    if(state.last_error)gaps.push(`${state.name}: last refresh failed; any retained evidence is from an earlier retrieval.`);
    if(!snapshot || !Number.isFinite(Date.parse(snapshot.fetched_at)) || now-Date.parse(snapshot.fetched_at)>7*86400000) {gaps.push(`${state.name}: refresh required; no snapshot from the past seven days.`);continue;}
    documents.push({id:`trend-${state.provider}-${createHash('sha256').update(JSON.stringify(snapshot.settings)).digest('hex').slice(0,12)}`,title:`General trend evidence · ${state.name}`,source:state.url,category:'opportunities',captured_at:snapshot.fetched_at,content:JSON.stringify(snapshot)});
  }
  return {documents,gaps};
}
