import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, Lightbulb, BarChart3, CalendarDays, PenLine, Tag } from 'lucide-react';
import { api } from '../services/api';

const QUICK_PROMPTS = [
  { icon: BarChart3, label: 'How am I performing?', prompt: 'How am I performing this month? Give me a summary of my analytics.' },
  { icon: CalendarDays, label: 'Plan my content', prompt: 'Help me plan my content for this week across all platforms.' },
  { icon: PenLine, label: 'Write a caption', prompt: 'Write me a few caption ideas for my latest post.' },
  { icon: Lightbulb, label: 'Best posting times', prompt: 'When should I post this week for maximum engagement?' },
  { icon: Tag, label: 'Organize my media', prompt: 'Help me organize and tag my media library.' },
  { icon: Sparkles, label: 'Generate a report', prompt: 'Generate a weekly performance report for all my platforms.' },
];

function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
        isUser ? 'bg-surface-200' : 'bg-gradient-to-br from-green-400 to-pink-500'
      }`}>
        {isUser ? <User className="w-4 h-4 text-surface-600" /> : <Sparkles className="w-4 h-4 text-white" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser
          ? 'bg-brand-500 text-white rounded-br-md'
          : 'bg-white border border-surface-200 text-surface-800 rounded-bl-md'
      }`}>
        <div className={`text-sm leading-relaxed whitespace-pre-wrap ${isUser ? '' : 'chat-markdown'}`}>
          {message.content.split('\n').map((line, i) => {
            // Simple markdown-ish rendering
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={i} className="font-semibold my-1">{line.replace(/\*\*/g, '')}</p>;
            }
            if (line.startsWith('- ') || line.startsWith('• ')) {
              return <p key={i} className="ml-3 my-0.5">{line}</p>;
            }
            if (line.match(/^\d+\./)) {
              return <p key={i} className="ml-3 my-0.5">{line}</p>;
            }
            // Bold inline
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
        <div className={`text-[10px] mt-1.5 ${isUser ? 'text-brand-200' : 'text-surface-300'}`}>
          {new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export default function AiChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.getChatMessages().then(r => setMessages(r.data || []));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);

    // Optimistic add
    const tempUser = { id: 'tmp-' + Date.now(), role: 'user', content: msg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUser]);

    try {
      const result = await api.sendChatMessage(msg);
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempUser.id),
        result.user_message,
        result.assistant_message,
      ]);
    } catch (e) {
      console.error(e);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 lg:px-8 py-4 border-b bg-white">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-surface-900">AI Assistant</h1>
            <p className="text-xs text-surface-400">Your personal analytics & content strategist</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-pink-500 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-surface-200 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-brand-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Quick prompts (show when few messages) */}
          {messages.length <= 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
              {QUICK_PROMPTS.map(({ icon: Icon, label, prompt }) => (
                <button
                  key={label}
                  onClick={() => sendMessage(prompt)}
                  className="card-hover p-3 text-left group"
                >
                  <Icon className="w-4 h-4 text-brand-400 mb-2 group-hover:text-brand-500" />
                  <span className="text-xs font-medium text-surface-700">{label}</span>
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-4 lg:px-8 py-4 border-t bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about analytics, content ideas, scheduling..."
                rows={1}
                className="input resize-none pr-12 py-3"
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              className="btn-primary px-4"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-surface-300 mt-1.5 text-center">
            AI responses are based on your analytics data. For production, connect OpenAI or Claude API for real-time intelligence.
          </p>
        </div>
      </div>
    </div>
  );
}
