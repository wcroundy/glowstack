import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoMedia, demoInsights } from '../services/demoData.js';

const router = Router();

// POST /api/ai/tag-media — AI auto-tagging
router.post('/tag-media', async (req, res) => {
  try {
    const { media_id } = req.body;

    if (!isSupabaseConfigured()) {
      const asset = demoMedia.find(m => m.id === media_id);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      return res.json({
        media_id,
        tags: asset.ai_tags || [],
        description: asset.ai_description,
        quality_score: asset.ai_quality_score,
        detected_products: asset.ai_detected_products || [],
        detected_brands: asset.ai_detected_brands || [],
        dominant_colors: asset.ai_dominant_colors || [],
        message: 'In production, this uses OpenAI Vision API for real analysis',
      });
    }

    // Fetch asset from DB
    const { data: asset, error } = await supabase
      .from('media_assets')
      .select('*')
      .eq('id', media_id)
      .single();
    if (error) throw error;
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // In production: call OpenAI Vision API here
    // For now, return existing AI data or placeholder
    res.json({
      media_id,
      tags: asset.ai_tags || [],
      description: asset.ai_description || 'AI analysis pending — configure OpenAI API key',
      quality_score: asset.ai_quality_score,
      detected_products: asset.ai_detected_products || [],
      detected_brands: asset.ai_detected_brands || [],
      dominant_colors: asset.ai_dominant_colors || [],
      message: asset.ai_description ? 'AI analysis complete' : 'Configure OPENAI_API_KEY for real AI analysis',
    });
  } catch (err) {
    console.error('AI tag-media error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/generate-captions
router.post('/generate-captions', async (req, res) => {
  try {
    const { media_id, platform, tone } = req.body;

    if (!isSupabaseConfigured()) {
      const asset = demoMedia.find(m => m.id === media_id);
      const captions = asset?.ai_caption_suggestions || [
        `Obsessed with this look! Save for later! #${platform || 'beauty'}`,
        'New content just dropped. What do you think?',
        'This one is for everyone who asked! Full details below!',
      ];
      return res.json({ media_id, platform, captions });
    }

    // Fetch asset for context
    const { data: asset } = await supabase
      .from('media_assets')
      .select('ai_caption_suggestions, ai_description, title')
      .eq('id', media_id)
      .single();

    // In production: call OpenAI to generate context-aware captions
    const captions = asset?.ai_caption_suggestions || [
      `Obsessed with this look! Save for later! #${platform || 'beauty'}`,
      'New content just dropped. What do you think?',
      'This one is for everyone who asked! Full details below!',
    ];
    res.json({ media_id, platform, captions });
  } catch (err) {
    console.error('AI generate-captions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggest-posting-time
router.post('/suggest-posting-time', (req, res) => {
  const { platform } = req.body;
  const suggestions = {
    instagram: { date: 'Thursday', time: '6:30 PM EST', confidence: 0.89, reason: 'Your audience is most active during this window, and Reels get 40% more reach.' },
    tiktok: { date: 'Friday', time: '7:00 PM EST', confidence: 0.92, reason: 'Friday evenings drive highest TikTok engagement. GRWM content averages 1.2M views.' },
    youtube: { date: 'Saturday', time: '10:00 AM EST', confidence: 0.85, reason: 'Weekend mornings get 2x watch time for tutorials.' },
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
  res.json({
    ideas: [
      { title: 'Spring Transition GRWM', type: 'reel', confidence: 0.94, reason: 'GRWM is your top format + seasonal transitions trending' },
      { title: '5 Drugstore Dupes for Luxury Products', type: 'carousel', confidence: 0.88, reason: 'Dupe content gets 2.5x saves, high affiliate potential' },
      { title: 'My Honest Review: [Trending Product]', type: 'video', confidence: 0.85, reason: 'Reviews build trust and drive affiliate revenue' },
      { title: 'Day in My Life — Content Creator Edition', type: 'vlog', confidence: 0.82, reason: 'BTS content increases follower loyalty by 35%' },
      { title: 'Outfit Styling: 1 Piece, 5 Ways', type: 'carousel', confidence: 0.90, reason: 'Multi-look posts are your highest-saved content on IG' },
    ],
  });
});

export default router;
