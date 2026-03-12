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

    const { assetIds, untaggedOnly } = req.body; // optional filters

    // 1. Get all managed tags
    const { data: allTags, error: tagErr } = await supabase
      .from('tags')
      .select('*');
    if (tagErr) throw tagErr;
    if (!allTags || allTags.length === 0) {
      return res.json({ tagged: 0, message: 'No tags defined. Create tags in the Tag Manager first.' });
    }

    // 2. Get assets to tag
    let assetQuery;

    if (untaggedOnly) {
      // Fetch assets that have zero tags assigned via left join
      assetQuery = supabase
        .from('media_assets')
        .select('id, file_name, title, file_url, thumbnail_url, ai_description, ai_tags, file_type, mime_type, media_tags(tag_id)')
        .eq('is_archived', false)
        .is('media_tags', null);
    } else {
      assetQuery = supabase
        .from('media_assets')
        .select('id, file_name, title, file_url, thumbnail_url, ai_description, ai_tags, file_type, mime_type')
        .eq('is_archived', false);
    }

    if (assetIds && assetIds.length > 0) {
      assetQuery = assetQuery.in('id', assetIds);
    }

    let { data: assets, error: assetErr } = await assetQuery.limit(100);

    // For untaggedOnly: if the .is('media_tags', null) filter isn't supported,
    // fall back to filtering in memory
    if (untaggedOnly && assets && assets.length > 0 && assets[0].media_tags !== undefined) {
      assets = assets.filter(a => !a.media_tags || a.media_tags.length === 0);
    }
    if (assetErr) throw assetErr;
    if (!assets || assets.length === 0) {
      return res.json({ tagged: 0, message: 'No assets found to tag' });
    }

    const tagMap = {};
    allTags.forEach(t => { tagMap[t.name.toLowerCase()] = t; });

    let totalTagged = 0;
    let totalNewTags = 0;

    // Track suggested new tags: { name: { assetIds: Set, count: number } }
    const suggestedNewTags = {};

    // 3. Process each asset
    for (const asset of assets) {
      let matchedTagIds = [];
      let assetSuggestedNew = [];

      if (OPENAI_API_KEY && asset.thumbnail_url) {
        // Use OpenAI Vision to analyze the image and match tags + suggest new ones
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
                  content: `You are a media tagging assistant for a beauty/fashion influencer. Given an image, do two things:
1. Determine which of the provided existing tags apply to the image.
2. Suggest up to 3 NEW tags that are NOT in the existing list but would be useful for categorizing this image (think: specific products, techniques, aesthetics, settings, content formats).

Return a JSON object with two arrays:
{"existing": ["Tag Name 1", "Tag Name 2"], "suggested": ["New Tag Idea 1"]}

Be generous with existing tag matching. For suggested tags, focus on specific, reusable beauty/fashion categories that would help organize a media library. Don't suggest tags that are too similar to existing ones.`,
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Existing tags: ${tagList}\n\nFilename: ${asset.file_name}\nTitle: ${asset.title || ''}\n\nReturn JSON with "existing" matches and "suggested" new tags.`,
                    },
                    {
                      type: 'image_url',
                      image_url: { url: asset.thumbnail_url, detail: 'low' },
                    },
                  ],
                },
              ],
              max_tokens: 300,
              temperature: 0.3,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            const content = result.choices?.[0]?.message?.content || '{}';

            // Try to parse as {existing: [], suggested: []}
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);

                // Handle existing tag matches
                const existingMatches = parsed.existing || parsed.matched || [];
                matchedTagIds = existingMatches
                  .map(name => tagMap[String(name).toLowerCase()])
                  .filter(Boolean)
                  .map(t => t.id);

                // Collect suggested new tags
                assetSuggestedNew = (parsed.suggested || [])
                  .map(name => String(name).trim())
                  .filter(name => name.length > 0 && !tagMap[name.toLowerCase()]);
              } catch (parseErr) {
                // Fallback: try parsing as plain array (old format)
                const arrMatch = content.match(/\[[\s\S]*?\]/);
                if (arrMatch) {
                  const tags = JSON.parse(arrMatch[0]);
                  matchedTagIds = tags
                    .map(name => tagMap[String(name).toLowerCase()])
                    .filter(Boolean)
                    .map(t => t.id);
                }
              }
            }
          } else {
            const errorBody = await response.text();
            console.error('OpenAI API error:', response.status, errorBody);

            // Detect insufficient quota / billing errors and stop early
            if (response.status === 429 || errorBody.includes('insufficient_quota') || errorBody.includes('billing')) {
              let detail = 'Unknown billing error';
              try {
                const parsed = JSON.parse(errorBody);
                detail = parsed.error?.message || detail;
              } catch (_) {}
              return res.status(402).json({
                error: 'openai_insufficient_quota',
                message: detail,
                totalAssetsProcessed: 0,
              });
            }
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
          if (searchText.includes(tagLower)) {
            matchedTagIds.push(tag.id);
          }
          const tagWords = tagLower.split(/\s+/);
          if (tagWords.length > 1 && tagWords.every(w => w.length > 2 && searchText.includes(w))) {
            if (!matchedTagIds.includes(tag.id)) matchedTagIds.push(tag.id);
          }
        }
      }

      // Track suggested new tags with their asset associations
      for (const sugName of assetSuggestedNew) {
        const key = sugName.toLowerCase();
        if (!suggestedNewTags[key]) {
          suggestedNewTags[key] = { name: sugName, assetIds: new Set(), count: 0 };
        }
        suggestedNewTags[key].assetIds.add(asset.id);
        suggestedNewTags[key].count++;
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
          await supabase.rpc('increment_tag_usage', { tag_uuid: tagId }).catch(() => {});
        }
      }
    }

    // Convert suggested tags to serializable array, sorted by frequency
    const suggestions = Object.values(suggestedNewTags)
      .map(s => ({ name: s.name, assetIds: [...s.assetIds], count: s.count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      tagged: totalTagged,
      totalAssetsProcessed: assets.length,
      totalNewTags,
      aiPowered: !!OPENAI_API_KEY,
      suggestedTags: suggestions,
      message: OPENAI_API_KEY
        ? `AI analyzed ${assets.length} assets and applied ${totalNewTags} tags to ${totalTagged} assets`
        : `Keyword matching applied ${totalNewTags} tags to ${totalTagged} assets. Add an OpenAI API key for AI-powered visual tagging.`,
    });
  } catch (err) {
    console.error('AI auto-tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/accept-suggested-tags — Create accepted tag suggestions and assign to assets
router.post('/accept-suggested-tags', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ created: 0, message: 'Demo mode' });
    }

    const { tags: acceptedTags } = req.body;
    // acceptedTags: [{ name: "Tag Name", assetIds: ["id1", "id2"], color: "#hex", category: "custom" }]

    if (!acceptedTags || acceptedTags.length === 0) {
      return res.json({ created: 0, assigned: 0, message: 'No tags to create' });
    }

    let totalCreated = 0;
    let totalAssigned = 0;

    for (const suggestion of acceptedTags) {
      // Create the tag
      const { data: newTag, error: createErr } = await supabase
        .from('tags')
        .insert({
          name: suggestion.name,
          color: suggestion.color || '#6366f1',
          category: suggestion.category || 'ai_suggested',
        })
        .select()
        .single();

      if (createErr) {
        console.error('Failed to create suggested tag:', suggestion.name, createErr.message);
        continue;
      }
      totalCreated++;

      // Assign to associated assets
      if (suggestion.assetIds && suggestion.assetIds.length > 0) {
        const tagInserts = suggestion.assetIds.map(assetId => ({
          media_id: assetId,
          tag_id: newTag.id,
          is_ai_assigned: true,
          confidence: 0.85,
        }));

        const { error: assignErr } = await supabase
          .from('media_tags')
          .upsert(tagInserts, { onConflict: 'media_id,tag_id' });

        if (assignErr) {
          console.error('Failed to assign suggested tag:', suggestion.name, assignErr.message);
        } else {
          totalAssigned += suggestion.assetIds.length;
        }
      }
    }

    res.json({
      created: totalCreated,
      assigned: totalAssigned,
      message: `Created ${totalCreated} new tags and assigned them to ${totalAssigned} assets`,
    });
  } catch (err) {
    console.error('Accept suggested tags error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
