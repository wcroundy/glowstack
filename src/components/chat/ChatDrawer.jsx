import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, User, Minimize2 } from 'lucide-react';
import { api } from '../../services/api';

export default function ChatDrawer({ isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      api.getChatMessages().then(r => setMessages(r.data || []));
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);

    const tempUser = { id: 'tmp-' + Date.now(), role: 'user', content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUser]);

    try {
      const result = await api.sendChatMessage(msg);
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUser.id),
        result.user_message,
        result.assistant_message,
      ]);
    } catch (e) { console.error(e); }
    setSending(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 h-[32rem] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-surface-200 flex flex-col z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-brand-500 to-brand-600">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">AI Assistant</span>
        </div>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
              msg.role === 'user' ? 'bg-surface-200' : 'bg-gradient-to-br from-brand-400 to-purple-500'
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
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            <div className="bg-surface-50 rounded-xl rounded-bl-sm px-3 py-2 flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" />
              <div className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
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
    </div>
  );
}
