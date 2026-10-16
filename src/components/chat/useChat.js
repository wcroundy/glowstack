import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api';

const ACTIVE_KEY = 'glowstack_chat_active';
const readActive = () => { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; } };
const writeActive = (id) => { try { id ? localStorage.setItem(ACTIVE_KEY, id) : localStorage.removeItem(ACTIVE_KEY); } catch { /* storage unavailable */ } };

/**
 * State for one open AI chat: which conversation, its messages, sending. `conversationId`
 * is null for a fresh chat — the server creates the conversation on the first answer.
 * The last-open conversation is remembered per browser so the page and the drawer agree.
 * `refreshKey` bumps whenever the conversation list should reload.
 */
export default function useChat({ enabled = true } = {}) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const loadSeq = useRef(0);

  const open = useCallback(async (id) => {
    const seq = ++loadSeq.current;
    setError('');
    if (!id) { setConversationId(null); setMessages([]); writeActive(null); return; }
    setLoading(true);
    try {
      const r = await api.getChatConversation(id);
      if (seq !== loadSeq.current) return;
      setConversationId(id);
      setMessages(r.data || []);
      writeActive(id);
    } catch {
      if (seq !== loadSeq.current) return;
      // gone (deleted elsewhere) — start fresh rather than show a broken chat
      setConversationId(null); setMessages([]); writeActive(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  // Pick up where the user left off: the remembered chat, else the most recent one.
  // Re-checked each time the chat opens, since the page and drawer share the memory.
  useEffect(() => {
    if (!enabled || sending) return;
    let cancelled = false;
    (async () => {
      const remembered = readActive();
      if (remembered) { if (remembered !== conversationId) await open(remembered); return; }
      if (conversationId || messages.length) return;
      try {
        const r = await api.getChatConversations();
        if (!cancelled && r.data?.[0]) await open(r.data[0].id);
      } catch { /* leave the empty chat */ }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  const send = useCallback(async (text) => {
    const msg = String(text || '').trim();
    if (!msg || sending) return null;
    setSending(true);
    setError('');
    const temp = { id: 'tmp-' + Date.now(), role: 'user', content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, temp]);
    try {
      const result = await api.sendChatMessage(msg, conversationId);
      setMessages(prev => [...prev.filter(m => m.id !== temp.id), result.user_message, result.assistant_message]);
      if (result.conversation?.id) { setConversationId(result.conversation.id); writeActive(result.conversation.id); }
      setRefreshKey(k => k + 1);
      return result;
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== temp.id));
      setError(String(e?.code || '').startsWith('ai_mcp_') && e.message ? e.message : "That didn't go through. Please try again.");
      return { failedMessage: msg };
    } finally {
      setSending(false);
    }
  }, [conversationId, sending]);

  const newChat = useCallback(() => { if (!sending) open(null); }, [open, sending]);
  const bump = useCallback(() => setRefreshKey(k => k + 1), []);

  return { conversationId, messages, sending, loading, error, refreshKey, open, send, newChat, bump, setError };
}
