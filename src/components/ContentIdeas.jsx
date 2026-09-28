import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import OutsideSignals, { OutsideExamples } from './OutsideSignals';
import { Link } from 'react-router-dom';

const CATEGORY_LABELS = {
  strategy: 'Brand strategy & voice',
  performance: 'Past performance notes',
  sales: 'Sales & partnerships',
  reuse: 'Reusable assets / reposts',
  products: 'Products & inventory',
  schedule: 'Content calendar',
  opportunities: 'Upcoming promos & collabs',
  coverage: 'Platform / channel notes',
};

function CitationLink({ evidence, onOpen }) {
  let url;
  try { const parsed = new URL(evidence.source); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href; } catch {}
  return url ? <a className="underline mt-1 inline-block" href={url} target="_blank" rel="noopener noreferrer">{evidence.title}</a> : <button className="underline mt-1" onClick={() => onOpen(evidence.source_id)}>{evidence.title}</button>;
}

// Always-visible summary of what actually feeds every recommendation, so nothing is
// hidden behind a collapsed section — including uploaded document names.
function StatusStrip({ library }) {
  if (!library) return <p className="text-xs text-surface-500">Loading what GlowStack already knows…</p>;
  const docCount = library.documents.length;
  const { influencers = 0, hashtags = 0 } = library.watchlist || {};
  return <div className="space-y-2">
    <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Used in every recommendation</p>
    <div className="flex items-start gap-2 text-sm">
      <span className="text-emerald-600 mt-0.5">✓</span>
      <span className="text-surface-700">Your Instagram &amp; Facebook posts — refreshed automatically each time</span>
    </div>
    <div className="flex items-start gap-2 text-sm">
      <span className={influencers || hashtags ? 'text-emerald-600 mt-0.5' : 'text-surface-400 mt-0.5'}>{influencers || hashtags ? '✓' : '–'}</span>
      {influencers || hashtags
        ? <span className="text-surface-700">Watchlist &amp; Trending — {influencers} creator{influencers === 1 ? '' : 's'}, {hashtags} hashtag{hashtags === 1 ? '' : 's'}, re-researched automatically each time</span>
        : <span className="text-surface-500">Watchlist &amp; Trending — none set up yet. <Link className="underline" to="/post-history">Add creators or hashtags to track</Link></span>}
    </div>
    <div className="flex items-start gap-2 text-sm">
      <span className={docCount ? 'text-emerald-600 mt-0.5' : 'text-surface-400 mt-0.5'}>{docCount ? '✓' : '–'}</span>
      <span className="text-surface-700">
        {docCount ? `Your uploaded background (${docCount}):` : 'Your uploaded background — none yet, add one below.'}
        {docCount > 0 && <span className="flex flex-wrap gap-1.5 mt-1.5">
          {library.documents.map(d => <span key={d.id} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-surface-100 text-surface-700 border border-surface-200" title={`${CATEGORY_LABELS[d.category] || d.category} · saved ${new Date(d.captured_at).toLocaleDateString()}`}>{d.title}</span>)}
        </span>}
      </span>
    </div>
    <div className="flex items-start gap-2 text-sm">
      <span className={library.ai_ready ? 'text-emerald-600 mt-0.5' : 'text-surface-400 mt-0.5'}>{library.ai_ready ? '✓' : '–'}</span>
      {library.ai_ready ? <span className="text-surface-700">Chat AI provider connected</span>
        : <span className="text-surface-500">No Chat AI provider connected yet. <Link className="underline" to="/settings">Connect one in Integrations</Link></span>}
    </div>
  </div>;
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
  const [docFile, setDocFile] = useState(null);
  const [docCategory, setDocCategory] = useState('strategy');
  const [docBusy, setDocBusy] = useState(false);
  const [docMessage, setDocMessage] = useState('');
  const docInputRef = useRef(null);
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
  async function uploadDocument(event) {
    event.preventDefault();
    if (!docFile) return;
    setDocBusy(true); setError(''); setDocMessage('');
    try {
      const uploaded = await api.uploadContentDocument(docFile, docCategory);
      setDocMessage(`Added "${uploaded.title}"${uploaded.truncated ? ' — it was long, so only the first part was saved.' : '.'} It'll be used in every recommendation from now on.`);
      setDocFile(null);
      if (docInputRef.current) docInputRef.current.value = '';
      setResult(null); await load();
    } catch (e) { setError(e.message); }
    finally { setDocBusy(false); }
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
    <div className="rounded-xl border border-surface-300 shadow-sm p-4">
      <StatusStrip library={library} />
    </div>

    <div className="rounded-xl border border-surface-300 shadow-sm p-4 space-y-3">
      <h3 className="font-semibold text-surface-900">Add background for GlowStack to use</h3>
      <p className="text-xs text-surface-500">Upload a strategy note, past-performance summary, product list — whatever you'd want considered. It's saved permanently and referenced every time you generate ideas.</p>
      <form className="flex flex-wrap items-center gap-2" onSubmit={uploadDocument}>
        <input ref={docInputRef} type="file" accept=".txt,.md,.markdown,.pdf,.docx" disabled={docBusy}
          onChange={e => setDocFile(e.target.files?.[0] || null)}
          className="text-xs max-w-full file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-surface-100 file:text-surface-700 file:text-xs hover:file:bg-surface-200" />
        <select className="input w-auto text-sm py-1.5" value={docCategory} onChange={e => setDocCategory(e.target.value)} disabled={docBusy}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit" className="btn-secondary text-sm" disabled={docBusy || !docFile}>{docBusy ? 'Adding…' : 'Add document'}</button>
      </form>
      {docMessage && <p role="status" className="text-xs text-brand-600">{docMessage}</p>}
      <p className="text-xs text-surface-400">Accepts .txt, .md, .pdf, or .docx.</p>
      <details className="pt-1">
        <summary className="cursor-pointer text-xs text-surface-500">Advanced: bulk import a knowledge JSON file</summary>
        <label className="block text-sm mt-2">Import knowledge JSON <input className="block my-2 text-xs max-w-full" type="file" accept="application/json,.json" disabled={busy} onChange={importFile} /></label>
      </details>
    </div>

    <div className="rounded-xl bg-brand-50 border border-brand-200 p-4 space-y-3">
      <h3 className="font-semibold text-surface-900">Your next content decision</h3>
      <p className="text-sm text-surface-600">One recommendation and one alternative, backed by everything listed above.</p>
      {library?.missing_categories?.length > 0 && library.documents.length > 0 && <p className="text-xs text-amber-700">Still missing: {library.missing_categories.map(c => CATEGORY_LABELS[c] || c).join(', ')}.</p>}
      <label className="block text-sm font-medium">Anything to focus on? <span className="font-normal text-surface-500">Optional</span>
        <textarea className="input mt-2" maxLength={1500} value={focus} onChange={e => setFocus(e.target.value)} placeholder="For example: reuse a proven fashion post, or plan Stories around a product sale." />
      </label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={refresh} disabled={busy} onChange={e=>setRefresh(e.target.checked)} /> Refresh my recent posts and Watchlist/Trending sources first</label>
      <p className="text-xs text-surface-500">Takes about a minute; unavailable results stay flagged. Turn it off to use saved data only.</p>
      <button className="btn-primary" disabled={busy || disabled || !library?.ai_ready} onClick={generate}>{busy ? 'Preparing evidence and recommendations…' : 'Generate recommendations'}</button>
    </div>

    <details className="rounded-xl border border-surface-300 shadow-sm p-4">
      <summary className="cursor-pointer font-medium text-sm">More ways to add context</summary>
      <div className="mt-3 space-y-3">
        <OutsideSignals disabled={busy || disabled} onSaved={async () => { setResult(null); await load(); }} />
        <div className="rounded-xl border border-surface-300 p-4 space-y-2">
          <h3 className="text-sm font-medium">General trends</h3>
          <p className="text-xs text-surface-600">Connect SocialCrawl and TrendsAPI.ai and refresh their data in Integrations. Generate recommendations includes saved trend evidence from the last seven days alongside your own results.</p>
          <Link className="text-sm underline text-brand-600" to="/settings#trend-integrations">Manage trend integrations</Link>
        </div>
      </div>
    </details>

    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!library && error && <button className="btn-secondary text-sm" onClick={load}>Retry loading sources</button>}

    <details open={source ? true : undefined} className="rounded-xl border border-surface-300 shadow-sm p-4">
      <summary className="cursor-pointer font-medium text-sm">Browse saved sources ({library?.documents.length ?? 0})</summary>
      <p className="text-xs text-surface-500 my-3">Reimporting the same source updates its snapshot. No automatic chat sync or sale tracking is running.</p>
      <input className="input my-2" aria-label="Filter sources" placeholder="Find a post, product, or strategy source" value={filter} onChange={e => setFilter(e.target.value)} />
      <div className="max-h-64 overflow-auto space-y-2">
        {library?.documents.filter(d => `${d.title} ${d.category}`.toLowerCase().includes(filter.toLowerCase())).map(d => <button key={d.id} className="block text-left w-full rounded-lg p-2 hover:bg-surface-50" onClick={() => openSource(d.id)}>
          <span className="text-sm font-medium">{d.title}</span><span className="block text-xs text-surface-500">{CATEGORY_LABELS[d.category] || d.category} · Snapshot {new Date(d.captured_at).toLocaleDateString()}</span>
        </button>)}
      </div>
      {source && <div className="border-t mt-3 pt-3"><button className="btn-ghost text-xs" onClick={() => setSource(null)}>Close source</button><h4 className="font-medium">{source.title}</h4><p className="text-xs text-surface-500 break-all">{source.source}</p><pre className="whitespace-pre-wrap break-words text-xs max-h-80 overflow-auto mt-2">{source.content}</pre></div>}
    </details>

    {result && <p className="text-xs text-surface-500">Reviewed excerpts from {result.reviewed_sources} of {result.total_sources} sources. This is a selected evidence review, not a complete historical audit.</p>}
    {result?.post_coverage?.length > 0 && <details className="border border-surface-300 shadow-sm rounded-xl p-4" open>
      <summary className="text-sm font-medium cursor-pointer">Instagram & Facebook evidence reviewed</summary>
      <p className="text-xs text-surface-500 mt-2">Historical totals identify candidates for reuse, not equal-age winners. Caption matches need format and topic review.</p>
      {result.post_coverage.map(c => <div key={c.platform} className="mt-3 text-xs space-y-1">
        <p className="font-semibold capitalize">{c.platform} · {c.selected_posts} unique posts</p>
        <p>{Object.entries(c.cohorts).map(([name, count]) => `${name.replaceAll('_', ' ')}: ${count ?? 'unavailable'}`).join(' · ')}. Groups can overlap.</p>
        <p>Metric refresh range: {c.oldest_refresh ? `${new Date(c.oldest_refresh).toLocaleString()} – ${new Date(c.newest_refresh).toLocaleString()}` : 'Unknown'}</p>
        <p>{c.stale_posts} older than 48 hours · {c.unknown_refresh} unknown refresh times · {c.missing_detailed_metrics} without verified detailed insights.</p>
      </div>)}
    </details>}
    {result?.external_examples?.length > 0 && <details className="border border-surface-300 shadow-sm rounded-xl p-4"><summary className="text-sm font-medium cursor-pointer">Outside examples supplied to this recommendation ({result.external_examples.length})</summary><div className="mt-3"><OutsideExamples examples={result.external_examples} /></div></details>}
    {result?.data_gaps?.map(g => <p key={g} className="text-xs text-amber-700">{g}</p>)}
    {result?.refresh && <p className="text-xs text-surface-600">Your posts refresh: {result.refresh.status}{result.refresh.reused ? ' (recent refresh receipt reused)' : ''}. {result.refresh.refreshed !== undefined ? `${result.refresh.refreshed} posts updated; ${result.refresh.failed} unavailable; ${result.refresh.not_refreshed} selected posts left unchanged (fresh or outside this batch). ${result.refresh.discovered} recent post records examined for discovery.` : ''}</p>}
    {result?.watchlist_refresh && <p className="text-xs text-surface-600">Watchlist/Trending refresh: {result.watchlist_refresh.status}{result.watchlist_refresh.reused ? ' (recent refresh receipt reused)' : ''}. {result.watchlist_refresh.refreshed !== undefined ? `${result.watchlist_refresh.refreshed} sources re-researched; ${result.watchlist_refresh.skipped_fresh} already fresh; ${result.watchlist_refresh.failed} unavailable.` : ''}</p>}
    {result?.ideas.map(idea => <article key={idea.id} className="rounded-xl border border-surface-300 shadow-sm p-5 space-y-3">
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
