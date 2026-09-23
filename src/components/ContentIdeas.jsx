import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import OutsideSignals, { OutsideExamples } from './OutsideSignals';
import { Link } from 'react-router-dom';

function CitationLink({ evidence, onOpen }) {
  let url;
  try { const parsed = new URL(evidence.source); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href; } catch {}
  return url ? <a className="underline mt-1 inline-block" href={url} target="_blank" rel="noopener noreferrer">{evidence.title}</a> : <button className="underline mt-1" onClick={() => onOpen(evidence.source_id)}>{evidence.title}</button>;
}

export default function ContentIdeas({ onUse, disabled }) {
  const [library, setLibrary] = useState(null);
  const [focus, setFocus] = useState('');
  const [refresh, setRefresh] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState(null);
  const [filter, setFilter] = useState('');
  const load = () => { setError(''); return api.getContentKnowledge().then(setLibrary).catch(e => setError(e.message)); };
  useEffect(() => { load(); }, []);
  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (file.size > 4000000) throw new Error('Choose an import file smaller than 4 MB.');
      const data = JSON.parse(await file.text());
      await api.importContentKnowledge(data.documents);
      setResult(null); await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); event.target.value = ''; }
  }
  async function generate() {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await api.aiContentIdeas(focus, refresh)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function openSource(id) {
    if (id.startsWith('app-')) return;
    try { setSource(await api.getContentSource(id)); } catch (e) { setError(e.message); }
  }
  return <section className="mt-6 space-y-4" aria-label="Evidence-backed ideas">
    <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 space-y-3">
      <h3 className="font-semibold text-surface-900">Your next content decision</h3>
      <p className="text-sm text-surface-600">One recommendation and one alternative, informed by your strategy, content results, sales, reusable assets, channel coverage and sale opportunities.</p>
      <p className="text-xs text-surface-500">{library ? `${library.documents.length} saved sources · Dated snapshots, not live monitoring` : 'Loading sources…'}</p>
      {library?.missing_categories?.length > 0 && <p className="text-xs text-amber-700">Missing source categories: {library.missing_categories.join(', ')}.</p>}
      {library && !library.ai_ready && <p className="text-sm text-surface-600">Your evidence can be reviewed below. Connect a Chat AI provider in <a className="underline" href="/settings">Integrations</a> to generate recommendations.</p>}
      <label className="block text-sm font-medium">Anything to focus on? <span className="font-normal text-surface-500">Optional</span>
        <textarea className="input mt-2" maxLength={1500} value={focus} onChange={e => setFocus(e.target.value)} placeholder="For example: reuse a proven fashion post, or plan Stories around a product sale." />
      </label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={refresh} disabled={busy} onChange={e=>setRefresh(e.target.checked)} /> Refresh recent Instagram/Facebook results and stale reuse candidates first</label>
      <p className="text-xs text-surface-500">A targeted refresh fetches text, post links and metrics only. It may take about a minute; unavailable results stay flagged. Turn it off to use saved data.</p>
      <button className="btn-primary" disabled={busy || disabled || !library?.ai_ready || !library.documents.length} onClick={generate}>{busy ? 'Preparing evidence and recommendations…' : 'Generate recommendations'}</button>
      <p className="text-xs text-surface-500">Generation sends selected source excerpts to your configured AI provider. Recommendations remain proposals for your review.</p>
    </div>
    <OutsideSignals disabled={busy || disabled} onSaved={async () => { setResult(null); await load(); }} />
    <div className="rounded-xl border border-surface-200 p-4 space-y-2">
      <h3 className="text-sm font-medium">General trends</h3>
      <p className="text-xs text-surface-600">Connect SocialCrawl and TrendsAPI.ai and refresh their data in Integrations. Generate recommendations includes saved trend evidence from the last seven days alongside your own results.</p>
      <Link className="text-sm underline text-brand-600" to="/settings#trend-integrations">Manage trend integrations</Link>
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!library && error && <button className="btn-secondary text-sm" onClick={load}>Retry loading sources</button>}
    <details open={source ? true : undefined} className="rounded-xl border border-surface-200 p-4">
      <summary className="cursor-pointer font-medium text-sm">Knowledge & measurement sources</summary>
      <p className="text-xs text-surface-500 my-3">Imports preserve source names and capture dates. Reimporting the same source updates its snapshot. No automatic chat sync or sale tracking is running.</p>
      <label className="block text-sm">Import knowledge JSON <input className="block my-2 text-xs max-w-full" type="file" accept="application/json,.json" disabled={busy} onChange={importFile} /></label>
      <input className="input my-2" aria-label="Filter sources" placeholder="Find a post, product, or strategy source" value={filter} onChange={e => setFilter(e.target.value)} />
      <div className="max-h-64 overflow-auto space-y-2">
        {library?.documents.filter(d => `${d.title} ${d.category}`.toLowerCase().includes(filter.toLowerCase())).map(d => <button key={d.id} className="block text-left w-full rounded-lg p-2 hover:bg-surface-50" onClick={() => openSource(d.id)}>
          <span className="text-sm font-medium">{d.title}</span><span className="block text-xs text-surface-500">{d.category} · Snapshot {new Date(d.captured_at).toLocaleDateString()}</span>
        </button>)}
      </div>
      {source && <div className="border-t mt-3 pt-3"><button className="btn-ghost text-xs" onClick={() => setSource(null)}>Close source</button><h4 className="font-medium">{source.title}</h4><p className="text-xs text-surface-500 break-all">{source.source}</p><pre className="whitespace-pre-wrap break-words text-xs max-h-80 overflow-auto mt-2">{source.content}</pre></div>}
    </details>
    {result && <p className="text-xs text-surface-500">Reviewed excerpts from {result.reviewed_sources} of {result.total_sources} sources. This is a selected evidence review, not a complete historical audit.</p>}
    {result?.post_coverage?.length > 0 && <details className="border border-surface-200 rounded-xl p-4" open>
      <summary className="text-sm font-medium cursor-pointer">Instagram & Facebook evidence reviewed</summary>
      <p className="text-xs text-surface-500 mt-2">Historical totals identify candidates for reuse, not equal-age winners. Caption matches need format and topic review.</p>
      {result.post_coverage.map(c => <div key={c.platform} className="mt-3 text-xs space-y-1">
        <p className="font-semibold capitalize">{c.platform} · {c.selected_posts} unique posts</p>
        <p>{Object.entries(c.cohorts).map(([name, count]) => `${name.replaceAll('_', ' ')}: ${count ?? 'unavailable'}`).join(' · ')}. Groups can overlap.</p>
        <p>Metric refresh range: {c.oldest_refresh ? `${new Date(c.oldest_refresh).toLocaleString()} – ${new Date(c.newest_refresh).toLocaleString()}` : 'Unknown'}</p>
        <p>{c.stale_posts} older than 48 hours · {c.unknown_refresh} unknown refresh times · {c.missing_detailed_metrics} without verified detailed insights.</p>
      </div>)}
    </details>}
    {result?.external_examples?.length > 0 && <details className="border border-surface-200 rounded-xl p-4"><summary className="text-sm font-medium cursor-pointer">Outside examples supplied to this recommendation ({result.external_examples.length})</summary><div className="mt-3"><OutsideExamples examples={result.external_examples} /></div></details>}
    {result?.data_gaps?.map(g => <p key={g} className="text-xs text-amber-700">{g}</p>)}
    {result?.refresh && <p className="text-xs text-surface-600">Refresh: {result.refresh.status}{result.refresh.reused ? ' (recent refresh receipt reused)' : ''}. {result.refresh.refreshed !== undefined ? `${result.refresh.refreshed} posts updated; ${result.refresh.failed} unavailable; ${result.refresh.not_refreshed} selected posts left unchanged (fresh or outside this batch). ${result.refresh.discovered} recent post records examined for discovery.` : ''}</p>}
    {result?.ideas.map(idea => <article key={idea.id} className="rounded-xl border border-surface-200 p-5 space-y-3">
      <p className="text-xs font-semibold text-brand-600">{idea.role} · {idea.mode} · Proposed</p>
      <h3 className="text-lg font-semibold">{idea.title}</h3><p className="text-sm italic">{idea.hook}</p>
      <p className="text-sm"><strong>Why now:</strong> {idea.why_now}</p><p className="text-sm"><strong>Goal:</strong> {idea.goal}</p>
      <p className="text-sm"><strong>Tradeoff:</strong> {idea.tradeoff}</p>
      <ul className="text-sm space-y-1">{idea.pieces.map(p => <li key={p.id}>{p.channel} · {p.format}: {p.purpose}</li>)}</ul>
      <p className="text-sm"><strong>Timing:</strong> {idea.timing}</p>
      <details><summary className="text-sm cursor-pointer">Production & measurement plan</summary><div className="text-sm space-y-2 mt-2"><p>{idea.shoot_notes}</p><p>{idea.edit_notes}</p><p>{idea.link_notes}</p><p><strong>Measure:</strong> {idea.measurement}</p></div></details>
      <details><summary className="text-sm cursor-pointer">Evidence & gaps</summary><div className="space-y-3 mt-2">{idea.evidence.map((e, i) => <blockquote key={i} className="border-l-2 border-brand-200 pl-3 text-xs"><p>{e.quote}</p><CitationLink evidence={e} onOpen={openSource} /><p>{e.freshness ? `Metrics refreshed: ${e.metrics_refreshed_at ? new Date(e.metrics_refreshed_at).toLocaleString() : 'unknown'} (${e.freshness})` : `Snapshot: ${new Date(e.captured_at).toLocaleDateString()}`}</p></blockquote>)}<ul className="text-xs text-amber-700 space-y-1">{idea.unknowns.map((u,i) => <li key={i}>{u}</li>)}</ul></div></details>
      <button disabled={disabled || busy} className="btn-primary text-sm" onClick={() => onUse(idea)}>Use this idea</button>
    </article>)}
  </section>;
}
