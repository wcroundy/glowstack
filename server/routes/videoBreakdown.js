import { Router } from 'express';
import { supabase, isSupabaseConfigured, uploadFile } from '../services/supabase.js';
import { getValidToken } from '../services/googlePhotos.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, unlink, readdir, mkdir, access, chmod } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Resolve ffmpeg binary path — use ffmpeg-static if available, fall back to system ffmpeg
let ffmpegBinPath = null;
try {
  const mod = await import('ffmpeg-static');
  const candidatePath = mod.default;
  if (candidatePath && existsSync(candidatePath)) {
    // Ensure the binary is executable (Vercel sometimes strips permissions)
    try { await chmod(candidatePath, 0o755); } catch {}
    ffmpegBinPath = candidatePath;
    console.log('ffmpeg-static binary found at:', ffmpegBinPath);
  }
} catch {
  console.warn('ffmpeg-static not available, checking for system ffmpeg...');
}

// Fallback: check if ffmpeg is on PATH
if (!ffmpegBinPath) {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    ffmpegBinPath = 'ffmpeg';
    console.log('Using system ffmpeg from PATH');
  } catch {
    console.warn('No ffmpeg available — server-side frame extraction will be disabled');
  }
}

const router = Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Cost constants
const COST_PER_FRAME_ANALYSIS_CENTS = 0.2; // ~$0.002 per gpt-4o-mini vision call (low detail)
const COST_PER_SCENE_DETECTION_CENTS = 0.5; // slightly more for the comparison prompt
const FRAME_INTERVAL_SECONDS = 2; // extract a frame every 2 seconds

// Helper: clean up temp files
async function cleanupTempFiles(videoPath, framesDir) {
  try { await unlink(videoPath); } catch {}
  try {
    const files = await readdir(framesDir).catch(() => []);
    for (const f of files) await unlink(join(framesDir, f)).catch(() => {});
    await unlink(framesDir).catch(() => {}); // rmdir
  } catch {}
}

// POST /api/video-breakdown/extract-and-process — full server-side pipeline
// Downloads video from Google Photos, extracts frames with ffmpeg, analyzes with OpenAI, saves results
// Client only sends { assetId, baseUrl } — no giant base64 payloads cross the wire
router.post('/extract-and-process', async (req, res) => {
  if (!ffmpegBinPath) {
    return res.status(501).json({ error: 'Server-side frame extraction is not available (ffmpeg not found)' });
  }
  if (!OPENAI_API_KEY) {
    return res.status(400).json({ error: 'OpenAI API key required for video breakdown' });
  }
  if (!isSupabaseConfigured()) {
    return res.status(400).json({ error: 'Supabase not configured' });
  }

  const { assetId, baseUrl, videoUrl } = req.body;
  if (!assetId) return res.status(400).json({ error: 'assetId is required' });
  if (!baseUrl && !videoUrl) return res.status(400).json({ error: 'baseUrl or videoUrl is required' });

  const tmpId = randomUUID();
  const videoPath = join(tmpdir(), `glowstack-video-${tmpId}.mp4`);
  const framesDir = join(tmpdir(), `glowstack-frames-${tmpId}`);

  try {
    // Verify asset exists
    const { data: asset, error: assetErr } = await supabase
      .from('media_assets')
      .select('id, file_type, title, file_name, duration_seconds, source, google_photos_id, captured_at')
      .eq('id', assetId)
      .single();

    if (assetErr || !asset) {
      return res.status(404).json({ error: 'Video asset not found' });
    }

    // ---- STEP 1: Download video ----
    let videoRes;
    if (baseUrl) {
      // Google Photos: needs auth token and =dv suffix
      const accessToken = await getValidToken();
      if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

      console.log('extract-and-process: downloading from Google Photos...');
      videoRes = await fetch(`${baseUrl}=dv`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(240000),
      });
    } else {
      // Direct URL (e.g. Supabase storage) — no auth needed
      console.log('extract-and-process: downloading from direct URL...');
      videoRes = await fetch(videoUrl, {
        signal: AbortSignal.timeout(240000),
      });
    }

    if (!videoRes.ok) {
      return res.status(502).json({ error: `Video download failed: HTTP ${videoRes.status}` });
    }

    const fileStream = createWriteStream(videoPath);
    await pipeline(Readable.fromWeb(videoRes.body), fileStream);
    console.log('extract-and-process: video downloaded');

    // ---- STEP 2: Extract frames with ffmpeg ----
    await mkdir(framesDir, { recursive: true });
    const outputPattern = join(framesDir, 'frame_%04d.jpg');
    await execFileAsync(ffmpegBinPath, [
      '-i', videoPath,
      '-vf', `fps=1/${FRAME_INTERVAL_SECONDS}`,
      '-q:v', '3',
      '-vframes', '60',
      outputPattern,
    ], { timeout: 120000 });

    // Read frame files as base64
    const frameFiles = (await readdir(framesDir)).filter(f => f.endsWith('.jpg')).sort();
    const frames = [];
    for (let i = 0; i < frameFiles.length; i++) {
      const buffer = await readFile(join(framesDir, frameFiles[i]));
      frames.push({
        timestamp: i * FRAME_INTERVAL_SECONDS,
        dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`,
      });
    }
    console.log(`extract-and-process: extracted ${frames.length} frames`);

    if (frames.length === 0) {
      return res.status(422).json({ error: 'ffmpeg extracted zero frames from video' });
    }

    // Done with temp files — clean up now to free disk space before AI call
    await cleanupTempFiles(videoPath, framesDir);

    // ---- STEP 3: Create breakdown run record ----
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

    if (runErr) console.error('Failed to create breakdown run:', runErr);

    // ---- STEP 4: Send frames to OpenAI for scene detection ----
    const imageContents = frames.map((frame) => ({
      type: 'image_url',
      image_url: { url: frame.dataUrl, detail: 'low' },
    }));

    const scenePrompt = `You are analyzing frames extracted from a beauty/fashion influencer video at ${FRAME_INTERVAL_SECONDS}-second intervals.

Your goal is to identify EVERY distinct item, outfit, or product showcased in the video. This is for a media asset management system — the influencer needs a thumbnail for each unique thing shown.

For each frame, determine:
1. What is the PRIMARY FOCUS — what outfit is being worn, OR what product/item is being held up, displayed, or showcased
2. Whether this represents something NEW that hasn't been captured yet

A frame is UNIQUE if ANY of these are true:
- A different outfit or clothing item is being WORN vs previous frames
- A product, garment, or item is being HELD UP or DISPLAYED to camera (even if the person's own outfit hasn't changed)
- A different beauty product, accessory, or item is the visual focus
- A clearly different hairstyle or makeup look is shown

IMPORTANT: In fashion/beauty videos, creators often hold up or showcase items while wearing the same outfit. A person holding up a pair of shorts, a bag, a product, etc. IS a unique scene even though their own clothing hasn't changed. The held-up item is the focus.

Return a JSON array where each element corresponds to a frame (in order):
[
  {
    "frameIndex": 0,
    "timestamp": ${frames[0]?.timestamp || 0},
    "isUnique": true,
    "description": "Wearing pink floral dress with gold jewelry, outdoor setting",
    "outfitOrProduct": "Pink floral dress",
    "setting": "Outdoor garden"
  },
  ...
]

Mark the FIRST frame as always unique. For duplicate frames showing the same thing, mark isUnique: false. When in doubt about whether something is new, lean toward marking it as unique — it's better to capture an extra scene than miss one.`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error('OpenAI scene detection error:', aiResponse.status, errBody);

      if (aiResponse.status === 429 || errBody.includes('insufficient_quota')) {
        let detail = 'OpenAI quota exceeded';
        try { detail = JSON.parse(errBody).error?.message || detail; } catch (_) {}
        if (run) {
          await supabase.from('video_breakdown_runs')
            .update({ status: 'failed', error_message: detail, completed_at: new Date().toISOString() })
            .eq('id', run.id);
        }
        return res.status(402).json({ error: 'openai_insufficient_quota', message: detail });
      }

      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || '[]';
    const finishReason = aiResult.choices?.[0]?.finish_reason;
    console.log('extract-and-process: OpenAI finish_reason:', finishReason, 'response length:', content.length);

    // Parse scene analysis
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    let scenes = [];
    if (jsonMatch) {
      try {
        scenes = JSON.parse(jsonMatch[0]);
      } catch (parseErr) {
        console.error('Failed to parse scene detection JSON:', parseErr.message);
        console.error('Raw content (first 500 chars):', content.substring(0, 500));
        // Fallback: treat all frames as unique
        scenes = frames.map((f, i) => ({
          frameIndex: i, timestamp: f.timestamp, isUnique: true,
          description: 'Scene ' + (i + 1), outfitOrProduct: 'Unknown',
        }));
      }
    } else {
      console.warn('extract-and-process: no JSON array found in OpenAI response');
      console.warn('Raw content (first 500 chars):', content.substring(0, 500));
      // Fallback: treat all frames as unique
      scenes = frames.map((f, i) => ({
        frameIndex: i, timestamp: f.timestamp, isUnique: true,
        description: 'Scene ' + (i + 1), outfitOrProduct: 'Unknown',
      }));
    }

    // Ensure the first frame is always unique (AI sometimes misses this)
    if (scenes.length > 0 && !scenes[0].isUnique) {
      scenes[0].isUnique = true;
    }

    // ---- STEP 5: Save unique frames as child assets ----
    let uniqueScenes = scenes.filter(s => s.isUnique);

    // Safety net: if AI marked everything as not unique, pick evenly spaced frames
    if (uniqueScenes.length === 0 && frames.length > 0) {
      console.warn('extract-and-process: AI found 0 unique scenes, falling back to evenly spaced frames');
      const step = Math.max(1, Math.floor(frames.length / 5)); // pick ~5 frames
      uniqueScenes = frames
        .filter((_, i) => i % step === 0)
        .map((f, idx) => ({
          frameIndex: idx * step, timestamp: f.timestamp, isUnique: true,
          description: `Scene ${idx + 1}`, outfitOrProduct: 'Unknown',
        }));
    }
    const savedAssets = [];

    for (const scene of uniqueScenes) {
      const frameData = frames[scene.frameIndex];
      if (!frameData) continue;

      const base64Data = frameData.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const framePath = `video-frames/${assetId}/${scene.frameIndex}_${Math.round(scene.timestamp)}s.jpg`;
      try {
        const uploaded = await uploadFile('thumbnails', framePath, buffer, 'image/jpeg');

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

    // ---- STEP 6: Update run record and respond ----
    const actualCostCents = Math.ceil(
      aiResult.usage?.total_tokens
        ? (aiResult.usage.total_tokens / 1000) * 0.015 * 100
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

    console.log(`extract-and-process: done — ${uniqueScenes.length} scenes, ${savedAssets.length} saved`);

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

  } catch (err) {
    console.error('extract-and-process error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await cleanupTempFiles(videoPath, framesDir);
  }
});

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
    const scenePrompt = `You are analyzing frames extracted from a beauty/fashion influencer video at ${FRAME_INTERVAL_SECONDS}-second intervals.

Your goal is to identify EVERY distinct item, outfit, or product showcased in the video. This is for a media asset management system — the influencer needs a thumbnail for each unique thing shown.

For each frame, determine:
1. What is the PRIMARY FOCUS — what outfit is being worn, OR what product/item is being held up, displayed, or showcased
2. Whether this represents something NEW that hasn't been captured yet

A frame is UNIQUE if ANY of these are true:
- A different outfit or clothing item is being WORN vs previous frames
- A product, garment, or item is being HELD UP or DISPLAYED to camera (even if the person's own outfit hasn't changed)
- A different beauty product, accessory, or item is the visual focus
- A clearly different hairstyle or makeup look is shown

IMPORTANT: In fashion/beauty videos, creators often hold up or showcase items while wearing the same outfit. A person holding up a pair of shorts, a bag, a product, etc. IS a unique scene even though their own clothing hasn't changed. The held-up item is the focus.

Return a JSON array where each element corresponds to a frame (in order):
[
  {
    "frameIndex": 0,
    "timestamp": ${frames[0]?.timestamp || 0},
    "isUnique": true,
    "description": "Wearing pink floral dress with gold jewelry, outdoor setting",
    "outfitOrProduct": "Pink floral dress",
    "setting": "Outdoor garden"
  },
  ...
]

Mark the FIRST frame as always unique. For duplicate frames showing the same thing, mark isUnique: false. When in doubt about whether something is new, lean toward marking it as unique — it's better to capture an extra scene than miss one.`;

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

// DELETE /api/video-breakdown/reset/:assetId — remove all extracted frames for a video
router.delete('/reset/:assetId', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    const assetId = req.params.assetId;

    // Delete child assets (frames) — storage files cleaned up by ON DELETE CASCADE won't help storage,
    // so delete storage files first
    const { data: children } = await supabase
      .from('media_assets')
      .select('id, file_url, thumbnail_url')
      .eq('parent_asset_id', assetId);

    if (children && children.length > 0) {
      // Delete storage files
      const storagePaths = children
        .map(c => {
          const url = c.thumbnail_url || c.file_url || '';
          const match = url.match(/\/storage\/v1\/object\/public\/thumbnails\/(.+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      if (storagePaths.length > 0) {
        await supabase.storage.from('thumbnails').remove(storagePaths);
      }

      // Delete child asset records
      await supabase
        .from('media_assets')
        .delete()
        .eq('parent_asset_id', assetId);
    }

    // Delete breakdown run records
    await supabase
      .from('video_breakdown_runs')
      .delete()
      .eq('video_asset_id', assetId);

    res.json({ success: true, deletedFrames: children?.length || 0 });
  } catch (err) {
    console.error('Video breakdown reset error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/video-breakdown/reset-all — remove ALL breakdown data
router.delete('/reset-all', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: 'Supabase not configured' });
    }

    // Delete all child assets that have a parent
    const { data: children } = await supabase
      .from('media_assets')
      .select('id, file_url, thumbnail_url')
      .not('parent_asset_id', 'is', null);

    if (children && children.length > 0) {
      const storagePaths = children
        .map(c => {
          const url = c.thumbnail_url || c.file_url || '';
          const match = url.match(/\/storage\/v1\/object\/public\/thumbnails\/(.+)/);
          return match ? match[1] : null;
        })
        .filter(Boolean);

      if (storagePaths.length > 0) {
        await supabase.storage.from('thumbnails').remove(storagePaths);
      }

      await supabase
        .from('media_assets')
        .delete()
        .not('parent_asset_id', 'is', null);
    }

    // Delete all breakdown runs
    await supabase
      .from('video_breakdown_runs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

    res.json({ success: true, deletedFrames: children?.length || 0 });
  } catch (err) {
    console.error('Video breakdown reset-all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
