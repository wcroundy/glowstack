import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoInsights, demoPosts, demoMedia, demoPlatformAnalytics } from '../services/demoData.js';

const router = Router();

// In-memory chat history for demo
const chatHistory = [
  {
    id: 'msg0',
    role: 'assistant',
    content: "Hey! I'm your AI assistant for GlowStack. I can help you with analytics, content planning, media management, and more. What would you like to work on?",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

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

// GET /api/chat/messages
router.get('/messages', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ data: chatHistory });
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    res.json({ data: data?.length ? data : chatHistory });
  } catch (err) {
    console.error('Chat messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/send
router.post('/send', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const aiResponse = generateResponse(message);

    if (!isSupabaseConfigured()) {
      const userMsg = {
        id: 'msg-' + Date.now(), role: 'user', content: message,
        created_at: new Date().toISOString(),
      };
      const assistantMsg = {
        id: 'msg-' + (Date.now() + 1), role: 'assistant', content: aiResponse.content,
        tool_calls: aiResponse.tool_calls || null, created_at: new Date().toISOString(),
      };
      chatHistory.push(userMsg, assistantMsg);
      return res.json({ user_message: userMsg, assistant_message: assistantMsg });
    }

    // Store user message
    const { data: userMsg, error: userErr } = await supabase
      .from('chat_messages')
      .insert({ role: 'user', content: message })
      .select()
      .single();
    if (userErr) throw userErr;

    // Store AI response
    const { data: assistantMsg, error: aiErr } = await supabase
      .from('chat_messages')
      .insert({
        role: 'assistant',
        content: aiResponse.content,
        tool_calls: aiResponse.tool_calls || null,
      })
      .select()
      .single();
    if (aiErr) throw aiErr;

    res.json({ user_message: userMsg, assistant_message: assistantMsg });
  } catch (err) {
    console.error('Chat send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
