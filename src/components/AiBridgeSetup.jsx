import { useState } from 'react';
import { api } from '../services/api';

export default function AiBridgeSetup({ bridge, onChanged }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pair() {
    setBusy(true); setError('');
    try { const result = await api.pairAiBridge(); setToken(result.token); onChanged(); }
    catch (e) { setError(e.data?.error || e.message); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError('');
    try { await api.disconnectAiBridge(); setToken(''); onChanged(); }
    catch (e) { setError(e.data?.error || e.message); }
    finally { setBusy(false); }
  }
  return <div className="card p-4 space-y-3">
    <div className="flex justify-between gap-3"><h3 className="font-semibold">MCP worker</h3>
      <span className={`text-xs ${bridge?.online ? 'text-emerald-700' : 'text-surface-500'}`}>{bridge?.online ? 'Online' : bridge?.paired ? 'Paired · offline' : 'Not paired'}</span></div>
    <p className="text-sm text-surface-600">Connect a computer signed into Codex with ChatGPT to process Glowstack AI requests. That computer must stay on with the worker running. Usage counts toward its Codex allowance.</p>
    {bridge?.model && <p className="text-xs text-surface-500">Worker model: {bridge.model}</p>}
    <div className="flex gap-2 flex-wrap">
      <button className="btn-primary text-sm" disabled={busy || !!bridge?.error} onClick={pair}>{bridge?.paired ? 'Replace pairing credential' : 'Create pairing credential'}</button>
      <button className="btn-ghost text-sm" disabled={busy} onClick={onChanged}>Refresh status</button>
      {bridge?.paired && <button className="btn-ghost text-sm text-red-600" disabled={busy} onClick={disconnect}>Disconnect worker</button>}
    </div>
    {token && <div className="space-y-2 rounded-xl bg-surface-50 p-3">
      <p className="text-sm">Copy this credential now; it is shown only once. Replacing it disconnects previously paired workers.</p>
      <input aria-label="Worker pairing credential" className="input font-mono text-xs" readOnly type="password" value={token} onFocus={e => e.target.select()} />
      <button className="btn-ghost text-xs" onClick={async () => { try { await navigator.clipboard.writeText(token); } catch { setError('Select the credential field and copy it manually.'); } }}>Copy credential</button>
    </div>}
    <details className="text-sm text-surface-600"><summary className="cursor-pointer">Worker setup</summary>
      <ol className="list-decimal ml-5 mt-2 space-y-2">
        <li>On the worker computer, install the project dependencies and sign into Codex with ChatGPT using <code>codex login</code>.</li>
        <li>Add <code>GLOWSTACK_URL</code> (your Glowstack site address) and <code>GLOWSTACK_WORKER_TOKEN</code> (the credential above) to the local, ignored <code>.env</code> file.</li>
        <li>Run <code>npm run ai:worker</code> from the project folder and refresh this status. Select MCP separately for either engine below.</li>
      </ol>
      <p className="mt-2">MCP uses fixed task defaults: Luna for chat and auto-tagging, Sol for recommendations and video scenes, all at standard speed. Restart the worker after updating the project. API model choices are kept separately.</p>
    </details>
    {(error || bridge?.error) && <p role="alert" className="text-sm text-red-700">{error || bridge.error}</p>}
  </div>;
}
