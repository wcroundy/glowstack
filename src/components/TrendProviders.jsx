import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

function Provider({ row, feeds, sources, disabled, onChanged }) {
  const [settings,setSettings]=useState(row.settings);
  const [key,setKey]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{setSettings(row.settings);},[row.settings]);
  const dirty=JSON.stringify(settings)!==JSON.stringify(row.settings) || !!key;
  async function act(action) {
    setBusy(true);setError('');setMessage('');
    try {
      if(action==='save') {await api.saveTrendProvider(row.provider,{settings,...(key?{apiKey:key}:{})});setKey('');setMessage('Saved. Refresh to verify access and collect evidence.');}
      if(action==='disconnect') {await api.disconnectTrendProvider(row.provider);setKey('');setMessage('Disconnected and saved evidence removed.');}
      if(action==='refresh') {const r=await api.refreshTrendProvider(row.provider);setMessage(r.reused?'Using the saved snapshot from the last six hours.':'Evidence refreshed. Generate recommendations to use it.');}
      await onChanged();
    } catch(e) {setError(e.message);if(action==='refresh')await onChanged();}
    finally {setBusy(false);}
  }
  const field=name=>({value:settings[name],onChange:e=>setSettings(s=>({...s,[name]:e.target.value}))});
  const lock=busy || disabled;
  return <div className="card p-5 space-y-3">
    <h4 className="text-sm font-semibold">{row.name} · {row.configured?'Key saved':'Not configured'}</h4>
    <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-xs underline">Provider setup and documentation</a>
    <fieldset disabled={lock} className="space-y-3">
      <label className="block text-sm">{row.configured?'Replace API key (optional)':'API key'}<input className="input mt-1" type="password" autoComplete="new-password" value={key} maxLength={2048} onChange={e=>setKey(e.target.value)} placeholder="Paste the service API key" /></label>
      <label className="block text-sm">Evidence type<select className="input mt-1" {...field('mode')}>
        {row.provider==='socialcrawl'?<><option value="search">TikTok topic search</option><option value="trending">TikTok regional popular feed</option></>:<><option value="get_top_trends">General trend feed</option><option value="get_growth">Keyword growth over 7 and 30 days</option></>}
      </select></label>
      {(settings.mode==='search' || settings.mode==='get_growth') && <label className="block text-sm">Topic<input className="input mt-1" maxLength={120} {...field('topic')} placeholder="e.g. fall outfits, skin tint" /></label>}
      {row.provider==='socialcrawl' && <label className="block text-sm">Region (two-letter code)<input className="input mt-1" maxLength={2} {...field('region')} /></label>}
      {settings.mode==='get_top_trends' && <label className="block text-sm">Feed<select className="input mt-1" {...field('feed')}>{feeds.map(f=><option key={f}>{f}</option>)}</select></label>}
      {settings.mode==='get_growth' && <label className="block text-sm">Keyword source<select className="input mt-1" {...field('source')}>{sources.map(f=><option key={f}>{f}</option>)}</select></label>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={()=>act('save')}>{row.configured?'Save changes':'Save API key & settings'}</button>
        <button type="button" className="btn-primary text-xs" disabled={!row.configured || dirty} onClick={()=>act('refresh')}>{busy?'Working…':'Refresh evidence'}</button>
        {row.configured && <button type="button" className="btn-ghost text-xs" onClick={()=>act('disconnect')}>Disconnect</button>}
      </div>
    </fieldset>
    {dirty && <p className="text-xs text-surface-500">Save changes before refreshing.</p>}
    <p className="text-xs text-surface-500">One provider request per refresh; provider charges/quotas apply. Snapshots are reused for six hours. No scheduled polling. Broad feeds may include unrelated topics.</p>
    {row.snapshot && <details><summary className="text-xs cursor-pointer">Saved evidence · {row.snapshot.items.length} items · Retrieved {new Date(row.snapshot.fetched_at).toLocaleString()}</summary>
      <div className="text-xs space-y-3 max-h-64 overflow-auto mt-3">
        {row.snapshot.as_of && <p>Provider’s measurement date: {row.snapshot.as_of}</p>}
        {row.snapshot.provider_cached && <p>The provider returned cached data; retrieval time is not measurement time.</p>}
        {row.snapshot.credits_used !== null && <p>Provider credits used: {row.snapshot.credits_used}</p>}
        {row.snapshot.items.map((item,i)=><div key={i} className="border-l-2 border-brand-200 pl-3">
          {item.topic && <p>Rank {item.rank ?? 'unknown'} · {item.topic}</p>}
          {item.text && <p>{item.text}</p>}
          {item.url && <a className="underline" href={item.url} target="_blank" rel="noopener noreferrer">View post</a>}
          {item.metrics && <p>{Object.entries(item.metrics).map(([name,value])=>`${name.replaceAll('_',' ')}: ${value ?? 'unknown'}`).join(' · ')}</p>}
          {item.period && <p>{item.period}: {item.growth === null?'Growth unavailable':`${item.growth}% provider-reported growth`} · {item.baseline_date || 'Unknown baseline date'} → {item.recent_date || 'Unknown recent date'}</p>}
        </div>)}
        {row.snapshot.warnings.map((w,i)=><p key={i} className="text-amber-700">{w}</p>)}
        <p className="text-surface-500">Outside popularity and search interest are context for a test; they do not establish your audience’s response or sales.</p>
      </div>
    </details>}
    {row.last_error && <p className="text-xs text-amber-700">{row.last_error}</p>}
    {message && <p role="status" className="text-xs text-brand-600">{message}</p>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
export default function TrendProviders({disabled,onChanged}) {
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  async function load() {setError('');try{setData(await api.getTrendProviders());}catch(e){setError(e.message);}}
  useEffect(()=>{load();},[]);
  return <section id="trend-integrations" aria-label="SocialCrawl and TrendsAPI.ai integrations" className="space-y-3 scroll-mt-6">
    <p className="text-xs text-surface-600">Use each service’s API key. No social profile password is needed. Keys stay in private server storage and are never sent to the recommendation AI. Refresh here, then Generate recommendations uses saved evidence from the last seven days alongside your own results.</p>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {!data && !error && <p className="text-xs">Loading connections…</p>}
    <button type="button" className="btn-ghost text-xs" onClick={load} disabled={disabled}>Reload connections</button>
    {data?.providers.map(row=><Provider key={row.provider} row={row} feeds={data.feeds} sources={data.sources} disabled={disabled} onChanged={async()=>{await load();onChanged?.();}} />)}
  </section>;
}
