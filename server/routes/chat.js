import { Router } from 'express';
import { demoInsights, demoPosts, demoMedia, demoPlatformAnalytics } from '../services/demoData.js';

const router = Router();

// In-memory chat history for demo
const chatHistory = [
  {
    id: 'msg0',
    role: 'assistant',
    content: "Hey! 👋 I'm your AI assistant for GlowStack. I can help you with analytics, content planning, media management, and more. What would you like to work on?",
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

// Simple AI response generator for demo
function generateResponse(message) {
  const lower = message.toLowerCase();

  if (lower.includes('best time') || lower.includes('when should') || lower.includes('when to post')) {
    return {
      content: "Based on your audience data, here are your optimal posting windows:\n\n**Instagram:** Tuesday & Thursday, 6-8 PM EST — your reels get 40% more reach in this window.\n\n**TikTok:** Friday & Saturday, 7-9 PM EST — your GRWM content peaks here with 1.2M avg views.\n\n**YouTube:** Saturday & Sunday, 10 AM-2 PM EST — tutorial content gets 2x watch time on weekends.\n\n**Pinterest:** Sunday & Monday evenings — your OOTD pins get the highest saves.\n\nWould you like me to adjust your content calendar to match these windows?",
      tool_calls: [{ function: 'analytics.getBestTimes', result: 'included in response' }],
    };
  }

  if (lower.includes('caption') || lower.includes('write')) {
    return {
      content: "Here are some caption ideas based on your brand voice and current trends:\n\n1. \"Not me spending 45 minutes on a 'no-makeup' makeup look 💀✨ But seriously, this 5-product routine is *the one*. Product list below 👇\"\n\n2. \"POV: Your skincare finally cleared the group chat 🧴💫 6 months of consistency and we're HERE.\"\n\n3. \"Spring transition outfit that works for brunch AND meetings — because adulting in style is non-negotiable 🌸\"\n\nWant me to tailor any of these for a specific platform or adjust the tone?",
    };
  }

  if (lower.includes('perform') || lower.includes('analytics') || lower.includes('how am i doing') || lower.includes('stats')) {
    const published = demoPosts.filter(p => p.status === 'published');
    const totalReach = published.reduce((s, p) => s + p.reach, 0);
    const avgEng = published.reduce((s, p) => s + p.engagement_rate, 0) / published.length;
    return {
      content: `Here's your performance snapshot:\n\n📊 **This Month Overview:**\n- Total reach across platforms: **${(totalReach/1000000).toFixed(1)}M**\n- Average engagement rate: **${avgEng.toFixed(1)}%** (industry avg is 3-5%)\n- Top performing post: GRWM Date Night on TikTok with **1.65M views**\n- Revenue from affiliate links: **$7,431.50**\n\n🔥 **Key Takeaway:** Your TikTok GRWM content is your strongest format at 12.1% engagement. I'd recommend doubling down on this format and cross-posting highlights to Instagram Reels.\n\nWant me to generate a detailed report?`,
    };
  }

  if (lower.includes('schedule') || lower.includes('plan') || lower.includes('calendar') || lower.includes('content plan')) {
    return {
      content: "I can help you plan your content! Here's what I'd suggest for this week based on your analytics:\n\n📅 **Suggested Content Plan:**\n\n**Tomorrow (Thu):** Instagram Reel — Wash Day Routine (already scheduled ✅)\n**Friday:** TikTok GRWM — Spring Transition Look (peak engagement day)\n**Saturday:** YouTube Tutorial — Spring Smokey Eye\n**Sunday:** Pinterest Board Update — Spring OOTDs (high save rates on Sundays)\n**Monday:** Instagram Carousel — Product Empties/Reviews\n\nI've noticed you have 12 unused high-quality assets that could work for these. Want me to match assets to this plan and add everything to your calendar?",
    };
  }

  if (lower.includes('tag') || lower.includes('organize') || lower.includes('sort')) {
    return {
      content: "I can help organize your media library! Here's what I can do:\n\n🏷️ **Auto-Tagging:** I've already AI-tagged all your assets with content type, products, mood, and season. You have 8 assets with full tag coverage.\n\n📁 **Organization Suggestions:**\n- 3 assets tagged 'Makeup' could also use the 'Tutorial' tag\n- Your 'Top Performer' tag should be on 2 more posts based on engagement data\n- I'd suggest creating a 'Spring 2026' campaign tag for upcoming seasonal content\n\nWant me to apply these suggestions, or would you prefer to review them in the media library?",
    };
  }

  if (lower.includes('report')) {
    return {
      content: "I'll generate a report for you! What type would you like?\n\n📋 **Available Reports:**\n1. **Weekly Performance** — engagement, reach, growth across all platforms\n2. **Monthly Overview** — comprehensive metrics with trend analysis\n3. **Platform Deep Dive** — detailed analytics for a specific platform\n4. **Revenue Report** — affiliate earnings, conversions, and top-performing links\n5. **Content Audit** — what's working, what's not, and recommendations\n\nJust let me know which one (or multiple!) and I'll have it ready in seconds.",
    };
  }

  return {
    content: "I'd be happy to help with that! Here are some things I can assist you with:\n\n- 📊 **Analytics** — performance reports, engagement trends, revenue tracking\n- 📅 **Content Planning** — scheduling, optimal post times, calendar management\n- 🏷️ **Media Management** — tagging, organizing, searching your assets\n- ✍️ **Captions** — AI-generated caption ideas for any platform\n- 💡 **Insights** — AI-powered recommendations to grow your audience\n- 📋 **Reports** — on-demand analytics reports\n\nWhat would you like to dive into?",
  };
}

// GET /api/chat/messages
router.get('/messages', (req, res) => {
  res.json({ data: chatHistory });
});

// POST /api/chat/send
router.post('/send', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const userMsg = {
    id: 'msg-' + Date.now(),
    role: 'user',
    content: message,
    created_at: new Date().toISOString(),
  };
  chatHistory.push(userMsg);

  // Generate AI response
  const aiResponse = generateResponse(message);
  const assistantMsg = {
    id: 'msg-' + (Date.now() + 1),
    role: 'assistant',
    content: aiResponse.content,
    tool_calls: aiResponse.tool_calls || null,
    created_at: new Date().toISOString(),
  };
  chatHistory.push(assistantMsg);

  res.json({ user_message: userMsg, assistant_message: assistantMsg });
});

export default router;
