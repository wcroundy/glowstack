import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export function OutsideExamples({ examples = [] }) {
  return <ul className="space-y-2 text-xs">{examples.map(d => <li key={d.id}>
    <a className="underline" href={d.source} target="_blank" rel="noopener noreferrer">{d.origins.join(', ')} · {d.format}</a>
    <p>Posted {new Date(d.published_at).toLocaleDateString()} · Observed {new Date(d.captured_at).toLocaleDateString()}</p>
    <p className="line-clamp-2">{d.caption}</p>
  </li>)}</ul>;
}

export default function OutsideSignals({ disabled, onSaved }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [reference, setReference] = useState({title:'',url:'',notes:'',observed_on:new Date().toLocaleDateString('en-CA')});
  async function load() {
    setError('');
    try { setData(await api.getContentTrends()); } catch(e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try {
      await api.saveTrendReference(reference);
      await onSaved();
      setReference(r => ({...r,title:'',url:'',notes:''})); setSaved(true);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const field = key => ({value:reference[key],onChange:e=>{setSaved(false);setReference(r=>({...r,[key]:e.target.value}));}});
  return <details className="rounded-xl border border-surface-200 p-4 space-y-3">
    <summary className="cursor-pointer font-medium text-sm">Outside inspiration & reference links</summary>
    <p className="text-xs text-surface-600">Recent examples from your Instagram creator and hashtag watchlists are included automatically when you generate recommendations. Your own performance, sales and strategy remain the primary evidence.</p>
    <p className="text-xs text-surface-500">Add fashion/beauty creators and topics, or refresh them, in <a className="underline" href="/post-history">Post History → Watchlist / Trending</a>. This uses saved observations; generating ideas does not refresh these watchlists or scan all social media.</p>
    <button type="button" className="btn-ghost text-xs" onClick={load} disabled={disabled || busy}>Reload source coverage</button>
    {!data && !error && <p className="text-xs">Loading outside sources…</p>}
    {data?.gaps.map(g=><p key={g} className="text-xs text-amber-700">{g}</p>)}
    {data?.coverage.map(c=><p key={`${c.kind}-${c.id}`} className="text-xs">{c.label}: {c.eligible} eligible of {c.stored_sample} sampled posts · {c.stale} stale · {c.undated} invalid/missing dates{c.read_error ? ` · ${c.read_error}` : ''}</p>)}
    <p className="text-xs text-surface-500">Up to 12 examples: posts from the last 14 days, observed within 7 days, at most two per source. Recent popularity is inspiration—not verified trend growth or proof of sales.</p>
    <OutsideExamples examples={data?.documents} />
    <form className="space-y-3 border-t pt-3" onSubmit={save}>
      <h4 className="text-sm font-medium">Save a reference from any platform</h4>
      <p className="text-xs text-surface-500">Save the link and what you noticed. Glowstack uses your notes; it does not fetch or analyze the linked post. Saving the same link updates its notes.</p>
      <label className="block text-sm">Title<input className="input mt-1" required maxLength={200} {...field('title')} /></label>
      <label className="block text-sm">Post or trend link<input className="input mt-1" type="url" placeholder="https://…" required maxLength={500} {...field('url')} /></label>
      <label className="block text-sm">Observation date<input className="input mt-1" type="date" required {...field('observed_on')} /></label>
      <label className="block text-sm">What caught your attention?<textarea className="input mt-1" required maxLength={5000} placeholder="Topic, hook, format, audience response, or dated measurements you observed." {...field('notes')} /></label>
      <button className="btn-secondary text-sm" disabled={disabled || busy}>{busy ? 'Saving…' : 'Save reference'}</button>
      {saved && <p role="status" className="text-xs text-brand-600">Saved to your knowledge sources. Generate recommendations to use the updated context.</p>}
    </form>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </details>;
}
