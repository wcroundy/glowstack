import React, { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, Check, MessageSquare } from 'lucide-react';
import { api } from '../../services/api';

const DAY = 24 * 60 * 60 * 1000;

function groupLabel(iso) {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const age = startOfToday.getTime() - new Date(iso).getTime();
  if (age <= 0) return 'Today';
  if (age <= DAY) return 'Yesterday';
  if (age <= 7 * DAY) return 'Previous 7 days';
  if (age <= 30 * DAY) return 'Previous 30 days';
  return 'Older';
}

/** Chat history: search, group by recency, rename, delete. */
export default function ConversationList({ activeId, onSelect, onNew, onDeleted, refreshKey, disabled = false }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    api.getChatConversations(debounced)
      .then(r => { if (!cancelled) setItems(r.data || []); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [debounced, refreshKey]);

  const saveTitle = async (id) => {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title) return;
    setItems(list => (list || []).map(c => (c.id === id ? { ...c, title } : c)));
    try { await api.renameChatConversation(id, title); } catch { /* list reloads on the next refresh */ }
  };

  const remove = async (id) => {
    setConfirmId(null);
    setItems(list => (list || []).filter(c => c.id !== id));
    try { await api.deleteChatConversation(id); } catch { /* ignore */ }
    onDeleted?.(id);
  };

  const groups = [];
  if (items && !debounced) {
    for (const c of items) {
      const label = groupLabel(c.last_message_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(c); else groups.push({ label, items: [c] });
    }
  }

  const row = (c) => (
    <div
      key={c.id}
      className={`group relative rounded-lg px-2.5 py-2 text-sm cursor-pointer ${c.id === activeId ? 'bg-brand-50 text-brand-700' : 'text-surface-700 hover:bg-surface-100'} ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      onClick={() => editingId !== c.id && onSelect(c.id)}
    >
      {editingId === c.id ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(c.id); if (e.key === 'Escape') setEditingId(null); }}
            className="input py-1 text-xs flex-1 min-w-0"
            aria-label="Chat title"
            maxLength={100}
          />
          <button className="p-1 text-green-600" onClick={() => saveTitle(c.id)} aria-label="Save title"><Check className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-surface-400" onClick={() => setEditingId(null)} aria-label="Cancel rename"><X className="w-3.5 h-3.5" /></button>
        </div>
      ) : confirmId === c.id ? (
        <div className="flex items-center justify-between gap-2 text-xs" onClick={e => e.stopPropagation()}>
          <span className="text-surface-600">Delete this chat?</span>
          <span className="flex gap-1">
            <button className="px-2 py-0.5 rounded bg-red-500 text-white" onClick={() => remove(c.id)}>Delete</button>
            <button className="px-2 py-0.5 rounded bg-surface-100 text-surface-600" onClick={() => setConfirmId(null)}>Cancel</button>
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
            <span className="truncate flex-1">{c.title}</span>
            <span className="hidden group-hover:flex shrink-0 gap-0.5" onClick={e => e.stopPropagation()}>
              <button className="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-surface-600" aria-label="Rename chat" onClick={() => { setEditingId(c.id); setDraftTitle(c.title); }}><Pencil className="w-3 h-3" /></button>
              <button className="p-1 rounded hover:bg-surface-200 text-surface-400 hover:text-red-500" aria-label="Delete chat" onClick={() => setConfirmId(c.id)}><Trash2 className="w-3 h-3" /></button>
            </span>
          </div>
          {c.snippet && <p className="mt-0.5 ml-5 text-[11px] text-surface-400 line-clamp-2">{c.snippet}</p>}
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <button onClick={onNew} disabled={disabled} className="btn-primary w-full justify-center text-sm mb-3">
        <Plus className="w-4 h-4" /> New chat
      </button>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search chats…"
          aria-label="Search chats"
          className="input pl-8 py-1.5 text-xs"
        />
        {query && (
          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600" onClick={() => setQuery('')} aria-label="Clear search"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {items === null && <p className="text-xs text-surface-400 px-2 py-3">Loading…</p>}
        {items && items.length === 0 && (
          <p className="text-xs text-surface-400 px-2 py-3">{debounced ? `No chats match “${debounced}”.` : 'No chats yet — ask something to get started.'}</p>
        )}
        {debounced
          ? (items || []).map(row)
          : groups.map(g => (
            <div key={g.label} className="mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400 px-2.5 py-1">{g.label}</p>
              {g.items.map(row)}
            </div>
          ))}
      </div>
    </div>
  );
}
