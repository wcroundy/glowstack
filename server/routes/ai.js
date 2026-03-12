import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoMedia, demoInsights } from '../services/demoData.js';

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

// POST /api/ai/auto-tag — AI auto-tag assets using managed tags
// Analyzes each asset and assigns matching tags from the tag manager
router.post('/auto-tag', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ tagged: 0, message: 'Demo mode — no Supabase configured' });
    }

    const { assetIds } = req.body; // optional: specific assets to tag, or all if empty

    // 1. Get all managed tags
    const { data: allTags, error: tagErr } = await supabase
      .from('tags')
      .select('*');
    if (tagErr) throw tagErr;
    if (!allTags || allTags.length === 0) {
      return res.json({ tagged: 0, message: 'No tags defined. Create tags in the Tag Manager first.' });
    }

    // 2. Get assets to tag
    let assetQuery = supabase
      .from('media_assets')
      .select('id, file_name, title, file_url, thumbnail_url, ai_description, ai_tags, file_type, mime_type')
      .eq('is_archived', false);

    if (assetIds && assetIds.length > 0) {
      assetQuery = assetQuery.in('id', assetIds);
    }

    const { data: assets, error: assetErr } = await assetQuery.limit(100);
    if (assetErr) throw assetErr;
    if (!assets || assets.length === 0) {
      return res.json({ tagged: 0, message: 'No assets found to tag' });
    }

    const tagNames = allTags.map(t => t.name.toLowerCase());
    const tagMap = {};
    allTags.forEach(t => { tagMap[t.name.toLowerCase()] = t; });

    let totalTagged = 0;
    let totalNewTags = 0;

    // 3. Process each asset
    for (const asset of assets) {
      let matchedTagIds = [];

      if (OPENAI_API_KEY && asset.thumbnail_url) {
        // Use OpenAI Vision to analyze the image and match tags
        try {
          const tagList = allTags.map(t => t.name).join(', ');
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are a media tagging assistant for a beauty/fashion influencer. Given an image, determine which of the provided tags apply. Only return tags from the provided list. Return a JSON array of matching tag names, nothing else. Be generous with tagging — if a tag could reasonably apply, include it.`,
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Available tags: ${tagList}\n\nFilename: ${asset.file_name}\nTitle: ${asset.title || ''}\n\nWhich of these tags apply to this image? Return only a JSON array of matching tag names.`,
                    },
                    {
                      type: 'image_url',
                      image_url: { url: asset.thumbnail_url, detail: 'low' },
                    },
                  ],
                },
              ],
              max_tokens: 200,
              temperature: 0.3,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            const content = result.choices?.[0]?.message?.content || '[]';
            // Parse the JSON array from the response
            const jsonMatch = content.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
              const suggestedTags = JSON.parse(jsonMatch[0]);
              matchedTagIds = suggestedTags
                .map(name => tagMap[name.toLowerCase()])
                .filter(Boolean)
                .map(t => t.id);
            }
          } else {
            console.error('OpenAI API error:', response.status, await response.text());
          }
        } catch (aiErr) {
          console.error('OpenAI Vision error for asset', asset.id, ':', aiErr.message);
        }
      }

      // Fallback: keyword matching on filename, title, and existing AI tags
      if (matchedTagIds.length === 0) {
        const searchText = [
          asset.file_name,
          asset.title,
          asset.ai_description,
          ...(asset.ai_tags || []),
        ].filter(Boolean).join(' ').toLowerCase();

        for (const tag of allTags) {
          const tagLower = tag.name.toLowerCase();
          // Check if the tag name (or significant portion) appears in the asset text
          if (searchText.includes(tagLower)) {
            matchedTagIds.push(tag.id);
          }
          // Also check individual words of multi-word tags
          const tagWords = tagLower.split(/\s+/);
          if (tagWords.length > 1 && tagWords.every(w => w.length > 2 && searchText.includes(w))) {
            if (!matchedTagIds.includes(tag.id)) matchedTagIds.push(tag.id);
          }
        }
      }

      // 4. Assign matched tags (upsert to avoid duplicates)
      if (matchedTagIds.length > 0) {
        const tagInserts = matchedTagIds.map(tagId => ({
          media_id: asset.id,
          tag_id: tagId,
          is_ai_assigned: true,
          confidence: OPENAI_API_KEY ? 0.85 : 0.5,
        }));

        const { error: insertErr } = await supabase
          .from('media_tags')
          .upsert(tagInserts, { onConflict: 'media_id,tag_id' });

        if (insertErr) {
          console.error('Tag insert error for asset', asset.id, ':', insertErr.message);
        } else {
          totalTagged++;
          totalNewTags += matchedTagIds.length;
        }

        // Update tag usage counts
        for (const tagId of matchedTagIds) {
          await supabase.rpc('increment_tag_usage', { tag_uuid: tagId }).catch(() => {
            // RPC might not exist, non-critical
          });
        }
      }
    }

    res.json({
      tagged: totalTagged,
      totalAssetsProcessed: assets.length,
      totalNewTags,
      aiPowered: !!OPENAI_API_KEY,
      message: OPENAI_API_KEY
        ? `AI analyzed ${assets.length} assets and applied ${totalNewTags} tags to ${totalTagged} assets`
        : `Keyword matching applied ${totalNewTags} tags to ${totalTagged} assets. Add an OpenAI API key for AI-powered visual tagging.`,
    });
  } catch (err) {
    console.error('AI auto-tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
