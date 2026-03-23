import { Router } from 'express';
import { supabase, isSupabaseConfigured, uploadFile } from '../services/supabase.js';

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Cost constants
const COST_PER_FRAME_ANALYSIS_CENTS = 0.2; // ~$0.002 per gpt-4o-mini vision call (low detail)
const COST_PER_SCENE_DETECTION_CENTS = 0.5; // slightly more for the comparison prompt
const FRAME_INTERVAL_SECONDS = 3; // extract a frame every 3 seconds

// POST /api/video-breakdown/estimate — calculate cost before running
router.post('/estimate', async (req, res) => {
  try {
    const { assetId } = req.body;

    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const { data: asset, error } = await supabase
      .from('media_assets')
      .select('id, file_type, duration_seconds, title, file_name')
      .eq('id', assetId)
      .single();

    if (error || !asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (asset.file_type !== 'video') {
      return res.status(400).json({ error: 'Asset is not a video' });
    }

    const duration = asset.duration_seconds || 30; // default 30s if unknown
    const totalFrames = Math.max(1, Math.floor(duration / FRAME_INTERVAL_SECONDS));
    const estimatedUniqueScenes = Math.max(1, Math.ceil(totalFrames * 0.4)); // assume ~40% are unique

    // Cost: analyze each frame + scene detection comparison
    const analysisCostCents = totalFrames * COST_PER_FRAME_ANALYSIS_CENTS;
    const sceneDetectionCostCents = COST_PER_SCENE_DETECTION_CENTS; // one call to compare all frames
    const totalEstimatedCostCents = Math.ceil(analysisCostCents + sceneDetectionCostCents);

    res.json({
      assetId: asset.id,
      title: asset.title || asset.file_name,
      durationSeconds: duration,
      frameInterval: FRAME_INTERVAL_SECONDS,
      totalFramesToExtract: totalFrames,
      estimatedUniqueScenes,
      estimatedCostCents: totalEstimatedCostCents,
      estimatedCostDisplay: `$${(totalEstimatedCostCents / 100).toFixed(2)}`,
      hasOpenAI: !!OPENAI_API_KEY,
    });
  } catch (err) {
    console.error('Video breakdown estimate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/video-breakdown/process — receive extracted frames and analyze
// Expects { assetId, frames: [{ timestamp, dataUrl }] }
router.post('/process', async (req, res) => {
  try {
    const { assetId, frames } = req.body;

    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }
    if (!OPENAI_API_KEY) {
      return res.status(400).json({ error: 'OpenAI API key required for video breakdown' });
    }
    if (!frames || frames.length === 0) {
      return res.status(400).json({ error: 'No frames provided' });
    }

    // Verify asset exists and is a video
    const { data: asset, error: assetErr } = await supabase
      .from('media_assets')
      .select('id, file_type, title, file_name, duration_seconds, source, google_photos_id')
      .eq('id', assetId)
      .single();

    if (assetErr || !asset) {
      return res.status(404).json({ error: 'Video asset not found' });
    }

    // Create a breakdown run record
    const estimatedCostCents = Math.ceil(
      frames.length * COST_PER_FRAME_ANALYSIS_CENTS + COST_PER_SCENE_DETECTION_CENTS
    );

    const { data: run, error: runErr } = await supabase
      .from('video_breakdown_runs')
      .insert({
        video_asset_id: assetId,
        status: 'processing',
        total_frames_extracted: frames.length,
        estimated_cost_cents: estimatedCostCents,
      })
      .select()
      .single();

    if (runErr) {
      console.error('Failed to create breakdown run:', runErr);
    }

    // Step 1: Send all frames to OpenAI to identify unique scenes
    const frameDescriptions = [];
    const imageContents = frames.map((frame, i) => ({
      type: 'image_url',
      image_url: { url: frame.dataUrl, detail: 'low' },
    }));

    // Build a single prompt with all frames for scene detection
    const scenePrompt = `You are analyzing frames extracted from a beauty/fashion video at ${FRAME_INTERVAL_SECONDS}-second intervals.

For each frame, determine:
1. What outfit, product, or look is shown
2. Whether it's a UNIQUE scene (different outfit, product, or setting from previous frames)

Return a JSON array where each element corresponds to a frame (in order):
[
  {
    "frameIndex": 0,
    "timestamp": ${frames[0]?.timestamp || 0},
    "isUnique": true,
    "description": "Pink floral dress with gold jewelry, outdoor setting",
    "outfitOrProduct": "Pink floral dress",
    "setting": "Outdoor garden"
  },
  ...
]

Mark the FIRST frame as always unique. Mark subsequent frames as unique ONLY if they show a clearly different outfit, product, hairstyle, or major setting change. Minor pose or angle changes are NOT unique.

Be selective — a typical 60-second video might have 2-5 truly unique scenes.`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: scenePrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze these ${frames.length} frames from a video (timestamps: ${frames.map(f => f.timestamp + 's').join(', ')}). Identify which frames show unique outfits, products, or looks. Return JSON array.`,
                },
                ...imageContents,
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error('OpenAI scene detection error:', response.status, errBody);

        if (response.status === 429 || errBody.includes('insufficient_quota')) {
          let detail = 'OpenAI quota exceeded';
          try { detail = JSON.parse(errBody).error?.message || detail; } catch (_) {}
          if (run) {
            await supabase.from('video_breakdown_runs')
              .update({ status: 'failed', error_message: detail, completed_at: new Date().toISOString() })
              .eq('id', run.id);
          }
          return res.status(402).json({ error: 'openai_insufficient_quota', message: detail });
        }

        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content || '[]';

      // Parse the scene analysis
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      let scenes = [];
      if (jsonMatch) {
        try {
          scenes = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.error('Failed to parse scene detection:', parseErr);
          // Fallback: treat all frames as unique
          scenes = frames.map((f, i) => ({
            frameIndex: i,
            timestamp: f.timestamp,
            isUnique: true,
            description: 'Scene ' + (i + 1),
            outfitOrProduct: 'Unknown',
          }));
        }
      }

      // Step 2: Save unique frames as child assets
      const uniqueScenes = scenes.filter(s => s.isUnique);
      const savedAssets = [];

      for (const scene of uniqueScenes) {
        const frameData = frames[scene.frameIndex];
        if (!frameData) continue;

        // Convert base64 data URL to buffer
        const base64Data = frameData.dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Upload to Supabase storage
        const framePath = `video-frames/${assetId}/${scene.frameIndex}_${Math.round(scene.timestamp)}s.jpg`;
        try {
          const uploaded = await uploadFile('thumbnails', framePath, buffer, 'image/jpeg');

          // Create child asset record
          const { data: childAsset, error: insertErr } = await supabase
            .from('media_assets')
            .insert({
              file_name: `${asset.file_name || 'video'}_frame_${Math.round(scene.timestamp)}s.jpg`,
              file_url: uploaded.publicUrl,
              thumbnail_url: uploaded.publicUrl,
              file_type: 'image',
              mime_type: 'image/jpeg',
              source: asset.source || 'video_breakdown',
              parent_asset_id: assetId,
              frame_timestamp: scene.timestamp,
              scene_description: scene.description,
              title: scene.outfitOrProduct || scene.description || `Scene at ${Math.round(scene.timestamp)}s`,
              ai_description: scene.description,
              ai_detected_products: scene.outfitOrProduct ? [scene.outfitOrProduct] : [],
              captured_at: asset.captured_at,
            })
            .select()
            .single();

          if (!insertErr && childAsset) {
            savedAssets.push(childAsset);
          } else if (insertErr) {
            console.error('Failed to save child asset:', insertErr);
          }
        } catch (uploadErr) {
          console.error('Failed to upload frame:', uploadErr.message);
        }
      }

      // Update the breakdown run
      const actualCostCents = Math.ceil(
        result.usage?.total_tokens
          ? (result.usage.total_tokens / 1000) * 0.015 * 100 // rough cost calc
          : estimatedCostCents
      );

      if (run) {
        await supabase.from('video_breakdown_runs')
          .update({
            status: 'completed',
            unique_scenes_found: uniqueScenes.length,
            frames_stored: savedAssets.length,
            actual_cost_cents: actualCostCents,
            completed_at: new Date().toISOString(),
          })
          .eq('id', run.id);
      }

      res.json({
        success: true,
        totalFramesAnalyzed: frames.length,
        uniqueScenesFound: uniqueScenes.length,
        framesStored: savedAssets.length,
        scenes: uniqueScenes.map(s => ({
          timestamp: s.timestamp,
          description: s.description,
          outfitOrProduct: s.outfitOrProduct,
        })),
        savedAssets: savedAssets.map(a => ({
          id: a.id,
          title: a.title,
          thumbnailUrl: a.thumbnail_url,
          frameTimestamp: a.frame_timestamp,
        })),
        estimatedCostDisplay: `$${(actualCostCents / 100).toFixed(2)}`,
      });

    } catch (aiErr) {
      console.error('Video breakdown AI error:', aiErr.message);
      if (run) {
        await supabase.from('video_breakdown_runs')
          .update({ status: 'failed', error_message: aiErr.message, completed_at: new Date().toISOString() })
          .eq('id', run.id);
      }
      res.status(500).json({ error: aiErr.message });
    }

  } catch (err) {
    console.error('Video breakdown error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video-breakdown/frames/:assetId — get extracted frames for a video
router.get('/frames/:assetId', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ frames: [] });
    }

    const { data: frames, error } = await supabase
      .from('media_assets')
      .select('id, title, thumbnail_url, frame_timestamp, scene_description, ai_tags, ai_detected_products')
      .eq('parent_asset_id', req.params.assetId)
      .order('frame_timestamp', { ascending: true });

    if (error) throw error;

    res.json({ frames: frames || [] });
  } catch (err) {
    console.error('Get video frames error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video-breakdown/runs — get breakdown run history
router.get('/runs', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ runs: [] });

    const { data: runs, error } = await supabase
      .from('video_breakdown_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ runs: runs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
