import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, Sparkles, User, History, Plus } from 'lucide-react';
import useChat from './useChat';
import ConversationList from './ConversationList';
import MediaSearchResults, { getMediaSearch, mediaSearchUrl } from './MediaSearchResults';

export default function ChatDrawer({ isOpen, onClose }) {
  const chat = useChat({ enabled: isOpen });
  const { messages, sending, loading, error, conversationId } = chat;
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, showHistory]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    const result = await chat.send(msg);
    if (result?.failedMessage) setInput(result.failedMessage);
    const found = getMediaSearch(result?.assistant_message);
    if (found?.results?.length) navigate(mediaSearchUrl(found));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[32rem] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-surface-200 flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-brand-500 to-brand-600">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">{showHistory ? 'Chat history' : 'AI Assistant'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { chat.newChat(); setShowHistory(false); setInput(''); }}
            disabled={sending}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
            aria-label="New chat" title="New chat"
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`p-1 rounded-lg hover:bg-white/20 transition-colors ${showHistory ? 'bg-white/20' : ''}`}
            aria-label="Chat history" title="Chat history"
          >
            <History className="w-4 h-4 text-white" />
          </button>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="flex-1 min-h-0 p-3">
          <ConversationList
            activeId={conversationId}
            onSelect={(id) => { chat.open(id); setShowHistory(false); }}
            onNew={() => { chat.newChat(); setShowHistory(false); setInput(''); }}
            onDeleted={(id) => { if (id === conversationId) chat.open(null); }}
            refreshKey={chat.refreshKey}
            disabled={sending}
          />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {loading && <p className="text-[11px] text-surface-400 text-center">Loading chat…</p>}
            {!loading && messages.length === 0 && (
              <p className="text-xs text-surface-500 bg-surface-50 rounded-xl px-3 py-2">
                Hey! Ask me about your analytics, content plans — or describe photos you want to find in your library.
              </p>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-surface-200' : 'bg-gradient-to-br from-green-400 to-pink-500'
                }`}>
                  {msg.role === 'user' ? <User className="w-3 h-3 text-surface-600" /> : <Sparkles className="w-3 h-3 text-white" />}
                </div>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white rounded-br-sm'
                    : 'bg-surface-50 text-surface-700 rounded-bl-sm'
                }`}>
                  {msg.content.split('\n').map((line, i) => {
                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
                    return (
                      <p key={i} className="my-0.5">
                        {parts.map((part, j) =>
                          part.startsWith('**') && part.endsWith('**')
                            ? <strong key={j} className="font-semibold">{part.replace(/\*\*/g, '')}</strong>
                            : part
                        )}
                      </p>
                    );
                  })}
                  {msg.role !== 'user' && <MediaSearchResults search={getMediaSearch(msg)} compact />}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-green-400 to-pink-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-surface-50 rounded-xl rounded-bl-sm px-3 py-2 flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            {error && <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ask me anything..."
                className="input text-xs py-2"
              />
              <button onClick={sendMessage} disabled={!input.trim() || sending} className="btn-primary px-3 py-2">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
