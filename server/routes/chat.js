import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoInsights, demoPosts, demoMedia, demoPlatformAnalytics } from '../services/demoData.js';
import * as aiProviders from '../services/aiProviders.js';
import { looksLikeMediaSearch, understandRequest, runMediaSearch } from '../services/mediaSearch.js';

const router = Router();

const CHAT_SYSTEM_PROMPT = `You are the AI assistant inside GlowStack, a media library and analytics tool built for a beauty/fashion content creator. You help with content planning, caption ideas, interpreting analytics, and organizing their media library. (When they want to find specific photos or videos, a separate search step handles it — you can invite them to describe what they're looking for, e.g. "find photos of me in a floral shirt with camo pants".) Be concise, warm, and actionable — this creator is not deeply technical, so avoid jargon.`;

/** Calls the user's connected Chat AI provider with recent conversation history. Returns null if none is configured. */
async function generateAiResponse(userId, message, history) {
  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: message },
  ];
  const text = await aiProviders.chatComplete(userId, messages);
  return text || null;
}

// In-memory store used when Supabase isn't configured (local demo mode)
const demoConversations = []; // { id, user_id, title, created_at, updated_at, last_message_at }
const demoMessages = [];      // { id, conversation_id, user_id, role, content, tool_calls, created_at }

// Simple AI response generator for demo
function generateResponse(message) {
  const lower = message.toLowerCase();

  if (lower.includes('best time') || lower.includes('when should') || lower.includes('when to post')) {
    return {
      content: "Based on your audience data, here are your optimal posting windows:\n\n**Instagram:** Tuesday & Thursday, 6-8 PM EST\n**TikTok:** Friday & Saturday, 7-9 PM EST\n**YouTube:** Saturday & Sunday, 10 AM-2 PM EST\n**Pinterest:** Sunday & Monday evenings\n\nWould you like me to adjust your content calendar to match these windows?",
      tool_calls: [{ function: 'analytics.getBestTimes', result: 'included in response' }],
    };
  }

  if (lower.includes('caption') || lower.includes('write')) {
    return {
      content: "Here are some caption ideas based on your brand voice:\n\n1. \"Not me spending 45 minutes on a 'no-makeup' look... But this 5-product routine is the one. Products below!\"\n\n2. \"POV: Your skincare finally cleared. 6 months of consistency and we're HERE.\"\n\n3. \"Spring transition outfit that works for brunch AND meetings\"\n\nWant me to tailor any of these for a specific platform?",
    };
  }

  if (lower.includes('perform') || lower.includes('analytics') || lower.includes('how am i doing') || lower.includes('stats')) {
    const published = demoPosts.filter(p => p.status === 'published');
    const totalReach = published.reduce((s, p) => s + p.reach, 0);
    const avgEng = published.reduce((s, p) => s + p.engagement_rate, 0) / published.length;
    return {
      content: `Here's your performance snapshot:\n\n**This Month Overview:**\n- Total reach: **${(totalReach/1000000).toFixed(1)}M**\n- Average engagement: **${avgEng.toFixed(1)}%**\n- Top post: GRWM Date Night on TikTok — **1.65M views**\n- Revenue: **$7,431.50**\n\nYour TikTok GRWM content is your strongest format at 12.1% engagement. I'd recommend doubling down on this.\n\nWant a detailed report?`,
    };
  }

  if (lower.includes('schedule') || lower.includes('plan') || lower.includes('calendar') || lower.includes('content plan')) {
    return {
      content: "Here's a suggested plan based on your analytics:\n\n**Tomorrow:** Instagram Reel — Wash Day Routine (scheduled)\n**Friday:** TikTok GRWM — Spring Transition Look\n**Saturday:** YouTube Tutorial — Spring Smokey Eye\n**Sunday:** Pinterest Board Update — Spring OOTDs\n**Monday:** Instagram Carousel — Product Reviews\n\nYou have 12 unused high-quality assets. Want me to match assets to this plan?",
    };
  }

  if (lower.includes('tag') || lower.includes('organize') || lower.includes('sort')) {
    return {
      content: "Here's your media organization status:\n\n**Auto-Tagging:** All assets have AI tags for content type, products, mood, and season.\n\n**Suggestions:**\n- 3 Makeup assets could also use the Tutorial tag\n- Your Top Performer tag should be on 2 more posts\n- Consider a Spring 2026 campaign tag\n\nWant me to apply these suggestions?",
    };
  }

  if (lower.includes('report')) {
    return {
      content: "I can generate these reports:\n\n1. **Weekly Performance** — engagement, reach, growth\n2. **Monthly Overview** — comprehensive trend analysis\n3. **Platform Deep Dive** — single platform analytics\n4. **Revenue Report** — affiliate earnings\n5. **Content Audit** — what's working + recommendations\n\nWhich one would you like?",
    };
  }

  return {
    content: "I can help with:\n\n- **Analytics** — performance reports, engagement trends, revenue\n- **Content Planning** — scheduling, optimal times, calendar\n- **Media Management** — tagging, organizing, searching\n- **Captions** — AI-generated caption ideas\n- **Insights** — AI recommendations to grow your audience\n- **Reports** — on-demand analytics reports\n\nWhat would you like to dive into?",
  };
}

// ─── Conversations ─────────────────────────────────────────────────────────────

const DEFAULT_TITLE = 'New chat';
const uid = req => req.userId || 'default';

/** First words of the opening message, trimmed at a word boundary. */
function titleFrom(message) {
  const text = String(message).replace(/\s+/g, ' ').trim();
  if (text.length <= 48) return text || DEFAULT_TITLE;
  const cut = text.slice(0, 48);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 24))}…`;
}

// ilike patterns: neutralise the wildcard characters in user input
const likeTerm = q => String(q).replace(/[%_\\,()]/g, ' ').trim();

async function getConversation(userId, id) {
  if (!isSupabaseConfigured()) return demoConversations.find(c => c.id === id && c.user_id === userId) || null;
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  const { data, error } = await supabase.from('chat_conversations').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function createConversation(userId, title = DEFAULT_TITLE) {
  if (!isSupabaseConfigured()) {
    const now = new Date().toISOString();
    const row = { id: 'conv-' + Date.now() + Math.random().toString(36).slice(2, 6), user_id: userId, title, created_at: now, updated_at: now, last_message_at: now };
    demoConversations.push(row);
    return row;
  }
  const { data, error } = await supabase.from('chat_conversations').insert({ user_id: userId, title }).select().single();
  if (error) throw error;
  return data;
}

async function listMessages(conversationId, { limit = 500, newestFirst = false } = {}) {
  if (!isSupabaseConfigured()) {
    const rows = demoMessages.filter(m => m.conversation_id === conversationId);
    return (newestFirst ? rows.slice(-limit) : rows.slice(0, limit));
  }
  const q = supabase.from('chat_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: !newestFirst }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return newestFirst ? (data || []).reverse() : (data || []);
}

// GET /api/chat/conversations?q=  — recent chats, or a search over titles and message text
router.get('/conversations', async (req, res) => {
  try {
    const userId = uid(req);
    const q = likeTerm(req.query.q || '');
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    if (!isSupabaseConfigured()) {
      let rows = demoConversations.filter(c => c.user_id === userId);
      if (q) {
        const needle = q.toLowerCase();
        rows = rows.filter(c => c.title.toLowerCase().includes(needle) || demoMessages.some(m => m.conversation_id === c.id && m.content.toLowerCase().includes(needle)));
      }
      return res.json({ data: rows.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)).slice(0, limit) });
    }

    if (!q) {
      const { data, error } = await supabase.from('chat_conversations').select('*').eq('user_id', userId).order('last_message_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return res.json({ data });
    }

    const [titleHits, messageHits] = await Promise.all([
      supabase.from('chat_conversations').select('*').eq('user_id', userId).ilike('title', `%${q}%`).limit(limit),
      supabase.from('chat_messages').select('conversation_id, content, created_at').eq('user_id', userId).ilike('content', `%${q}%`).not('conversation_id', 'is', null).order('created_at', { ascending: false }).limit(300),
    ]);
    if (titleHits.error) throw titleHits.error;
    if (messageHits.error) throw messageHits.error;

    // best (most recent) matching message per conversation, shown as a snippet
    const snippets = new Map();
    for (const m of messageHits.data || []) {
      if (snippets.has(m.conversation_id)) continue;
      const at = m.content.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, at - 30);
      snippets.set(m.conversation_id, `${start ? '…' : ''}${m.content.slice(start, start + 110).replace(/\s+/g, ' ')}${m.content.length > start + 110 ? '…' : ''}`);
    }
    const byId = new Map((titleHits.data || []).map(c => [c.id, c]));
    const missing = [...snippets.keys()].filter(id => !byId.has(id));
    if (missing.length) {
      const { data, error } = await supabase.from('chat_conversations').select('*').eq('user_id', userId).in('id', missing);
      if (error) throw error;
      (data || []).forEach(c => byId.set(c.id, c));
    }
    const rows = [...byId.values()]
      .map(c => ({ ...c, snippet: snippets.get(c.id) || null }))
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
      .slice(0, limit);
    res.json({ data: rows });
  } catch (err) {
    console.error('Chat conversations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/conversations — start an empty chat
router.post('/conversations', async (req, res) => {
  try {
    res.json({ data: await createConversation(uid(req)) });
  } catch (err) {
    console.error('Chat create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/chat/conversations/:id — rename
router.patch('/conversations/:id', async (req, res) => {
  try {
    const userId = uid(req);
    const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!title) return res.status(400).json({ error: 'Title required' });
    const convo = await getConversation(userId, req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (!isSupabaseConfigured()) { convo.title = title; return res.json({ data: convo }); }
    const { data, error } = await supabase.from('chat_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', convo.id).eq('user_id', userId).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Chat rename error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chat/conversations/:id — removes the chat and its messages
router.delete('/conversations/:id', async (req, res) => {
  try {
    const userId = uid(req);
    const convo = await getConversation(userId, req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    if (!isSupabaseConfigured()) {
      demoConversations.splice(demoConversations.indexOf(convo), 1);
      for (let i = demoMessages.length - 1; i >= 0; i--) if (demoMessages[i].conversation_id === convo.id) demoMessages.splice(i, 1);
      return res.json({ ok: true });
    }
    const { error } = await supabase.from('chat_conversations').delete().eq('id', convo.id).eq('user_id', userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Chat delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const convo = await getConversation(uid(req), req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ conversation: convo, data: await listMessages(convo.id) });
  } catch (err) {
    console.error('Chat messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/send  { message, conversation_id? } — starts a new chat when no id is given
router.post('/send', async (req, res) => {
  try {
    const { message, conversation_id: conversationId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const userId = uid(req);

    let convo = null;
    if (conversationId) {
      convo = await getConversation(userId, conversationId);
      if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    }

    // Only this conversation's recent messages are context for the model
    const history = convo ? await listMessages(convo.id, { limit: 10, newestFirst: true }) : [];

    let aiResponse = null;
    try {
      // Asking to find photos/videos runs the library search instead of a plain chat reply
      if (isSupabaseConfigured()) {
        const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
        const previousSearch = lastAssistant?.tool_calls?.find?.(t => t.function === 'media_search')?.result || null;
        if (looksLikeMediaSearch(message, { previousWasSearch: !!previousSearch })) {
          const understood = await understandRequest(userId, message, {
            history,
            previous: previousSearch?.concept_words ? { summary: previousSearch.summary, concepts: previousSearch.concept_words } : null,
          });
          if (understood?.is_search) {
            try {
              const { content, search } = await runMediaSearch(userId, understood, { log: (step, info) => console.log('[media-search]', step, JSON.stringify(info)) });
              aiResponse = { content, tool_calls: [{ function: 'media_search', result: search }] };
            } catch (err) {
              if (err.code?.startsWith('ai_mcp_')) throw err;
              console.error('Media search error:', err.message);
              aiResponse = {
                content: err.code === 'ai_insufficient_quota'
                  ? 'Your AI provider is out of credit, so I couldn\'t run that search. Add credit with your provider and ask again.'
                  : 'I ran into a problem searching your library. Please try again in a moment.',
              };
            }
          }
        }
      }

      if (!aiResponse) {
        const aiText = await generateAiResponse(userId, message, history);
        if (aiText) aiResponse = { content: aiText };
      }
    } catch (err) {
      if (err.code?.startsWith('ai_mcp_')) return res.status(503).json({ error: err.code, message: err.message });
      console.error('AI chat error, falling back to canned response:', err.message);
    }

    // Fall back to the keyword-based stub if no Chat AI is configured or the call failed
    if (!aiResponse) aiResponse = generateResponse(message);

    // The chat is created only once there is an answer to keep, so a failed first
    // message (e.g. worker offline) doesn't leave an empty conversation behind
    if (!convo) convo = await createConversation(userId, titleFrom(message));
    else if (convo.title === DEFAULT_TITLE) convo.title = titleFrom(message);
    const now = new Date().toISOString();

    if (!isSupabaseConfigured()) {
      const userMsg = { id: 'msg-' + Date.now(), conversation_id: convo.id, user_id: userId, role: 'user', content: message, created_at: now };
      const assistantMsg = {
        id: 'msg-' + (Date.now() + 1), conversation_id: convo.id, user_id: userId, role: 'assistant', content: aiResponse.content,
        tool_calls: aiResponse.tool_calls || null, created_at: new Date(Date.now() + 1).toISOString(),
      };
      demoMessages.push(userMsg, assistantMsg);
      Object.assign(convo, { title: convo.title, updated_at: now, last_message_at: now });
      return res.json({ conversation: convo, user_message: userMsg, assistant_message: assistantMsg });
    }

    const { data: userMsg, error: userErr } = await supabase
      .from('chat_messages')
      .insert({ conversation_id: convo.id, user_id: userId, role: 'user', content: message })
      .select().single();
    if (userErr) throw userErr;

    const { data: assistantMsg, error: aiErr } = await supabase
      .from('chat_messages')
      .insert({ conversation_id: convo.id, user_id: userId, role: 'assistant', content: aiResponse.content, tool_calls: aiResponse.tool_calls || null })
      .select().single();
    if (aiErr) throw aiErr;

    const { data: updated, error: convoErr } = await supabase
      .from('chat_conversations')
      .update({ title: convo.title, updated_at: now, last_message_at: now })
      .eq('id', convo.id).eq('user_id', userId)
      .select().single();
    if (convoErr) throw convoErr;

    res.json({ conversation: updated, user_message: userMsg, assistant_message: assistantMsg });
  } catch (err) {
    console.error('Chat send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chat/messages — legacy: the most recent conversation's messages
router.get('/messages', async (req, res) => {
  try {
    const userId = uid(req);
    const recent = isSupabaseConfigured()
      ? (await supabase.from('chat_conversations').select('*').eq('user_id', userId).order('last_message_at', { ascending: false }).limit(1)).data?.[0]
      : demoConversations.filter(c => c.user_id === userId).sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))[0];
    res.json({ data: recent ? await listMessages(recent.id) : [] });
  } catch (err) {
    console.error('Chat messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
