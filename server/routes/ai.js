import { Router } from 'express';
import { demoMedia, demoInsights } from '../services/demoData.js';

const router = Router();

// POST /api/ai/tag-media — AI auto-tagging
router.post('/tag-media', (req, res) => {
  const { media_id } = req.body;
  const asset = demoMedia.find(m => m.id === media_id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  res.json({
    media_id,
    tags: asset.ai_tags || [],
    description: asset.ai_description,
    quality_score: asset.ai_quality_score,
    detected_products: asset.ai_detected_products || [],
    detected_brands: asset.ai_detected_brands || [],
    dominant_colors: asset.ai_dominant_colors || [],
    message: 'In production, this uses OpenAI Vision API for real analysis',
  });
});

// POST /api/ai/generate-captions
router.post('/generate-captions', (req, res) => {
  const { media_id, platform, tone } = req.body;
  const asset = demoMedia.find(m => m.id === media_id);

  const captions = asset?.ai_caption_suggestions || [
    `Obsessed with this look ✨ Save for later! #${platform || 'beauty'}`,
    'New content just dropped — what do you think? 💬',
    'This one is for the girlies who asked 💕 Full details below!',
  ];

  res.json({ media_id, platform, captions });
});

// POST /api/ai/suggest-posting-time
router.post('/suggest-posting-time', (req, res) => {
  const { platform, content_type } = req.body;

  const suggestions = {
    instagram: { date: 'Thursday', time: '6:30 PM EST', confidence: 0.89, reason: 'Your audience is most active during this window, and Reels posted here get 40% more initial reach.' },
    tiktok: { date: 'Friday', time: '7:00 PM EST', confidence: 0.92, reason: 'Friday evenings drive your highest TikTok engagement. GRWM content posted at this time averages 1.2M views.' },
    youtube: { date: 'Saturday', time: '10:00 AM EST', confidence: 0.85, reason: 'Weekend mornings get 2x watch time for tutorials on your channel.' },
    pinterest: { date: 'Sunday', time: '8:00 PM EST', confidence: 0.78, reason: 'Sunday evening pinning drives highest saves and click-throughs.' },
  };

  res.json(suggestions[platform] || suggestions.instagram);
});

// GET /api/ai/insights
router.get('/insights', (req, res) => {
  res.json({ data: demoInsights });
});

// POST /api/ai/content-ideas
router.post('/content-ideas', (req, res) => {
  const { platform, niche } = req.body;
  res.json({
    ideas: [
      { title: 'Spring Transition GRWM', type: 'reel', confidence: 0.94, reason: 'GRWM is your top-performing format + seasonal transitions are trending' },
      { title: '5 Drugstore Dupes for Luxury Products', type: 'carousel', confidence: 0.88, reason: 'Dupe content gets 2.5x saves, high affiliate conversion potential' },
      { title: 'My Honest Review: [Trending Product]', type: 'video', confidence: 0.85, reason: 'Review content builds trust and drives affiliate revenue' },
      { title: 'Day in My Life — Content Creator Edition', type: 'vlog', confidence: 0.82, reason: 'Behind-the-scenes content increases follower loyalty by 35%' },
      { title: 'Outfit Styling: 1 Piece, 5 Ways', type: 'carousel', confidence: 0.90, reason: 'Multi-look styling posts are your highest-saved content type on Instagram' },
    ],
  });
});

export default router;
