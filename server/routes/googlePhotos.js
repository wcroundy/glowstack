import { Router } from 'express';
import { supabase, isSupabaseConfigured, uploadFile, getPublicUrl } from '../services/supabase.js';
import {
  getAuthUrl, exchangeCode, getValidToken,
  createSession, getSession, listSessionMediaItems, deleteSession,
  isGoogleConfigured,
} from '../services/googlePhotos.js';

const router = Router();

const CLIENT_REDIRECT = process.env.CLIENT_URL || 'http://localhost:5173';

// GET /api/google-photos/status — check if Google Photos is connected
router.get('/status', async (req, res) => {
  try {
    if (!isGoogleConfigured()) {
      return res.json({
        configured: false,
        connected: false,
        message: 'Google API credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env',
      });
    }

    if (!isSupabaseConfigured()) {
      return res.json({ configured: true, connected: false, message: 'Supabase not configured' });
    }

    const { data: connection } = await supabase
      .from('platform_connections')
      .select('is_connected, metadata')
      .eq('platform', 'google_photos')
      .single();

    const connected = !!(connection?.is_connected && connection?.metadata?.refresh_token);

    res.json({
      configured: true,
      connected,
      account: connected ? (connection.metadata?.email || 'Connected') : null,
    });
  } catch (err) {
    console.error('Google Photos status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-photos/auth-url — get the OAuth consent URL
router.get('/auth-url', (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(400).json({ error: 'Google API credentials not configured' });
  }
  const state = req.headers.authorization?.replace('Bearer ', '') || '';
  const url = getAuthUrl(state);
  res.json({ url });
});

// GET /api/auth/google/callback — OAuth callback (no auth middleware, browser redirect)
router.get('/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.redirect(`${CLIENT_REDIRECT}/media?google_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${CLIENT_REDIRECT}/media?google_error=no_code`);
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code);
    console.log('OAuth tokens received. Scope:', tokens.scope);

    // Get user info for display
    let email = '';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        email = userInfo.email || '';
      }
    } catch { /* email is optional */ }

    // Store tokens in platform_connections
    if (isSupabaseConfigured()) {
      await supabase
        .from('platform_connections')
        .upsert({
          platform: 'google_photos',
          display_name: 'Google Photos',
          is_connected: true,
          connected_at: new Date().toISOString(),
          account_username: email,
          metadata: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: Date.now() + (tokens.expires_in * 1000),
            token_type: tokens.token_type,
            scope: tokens.scope,
            email,
          },
        }, { onConflict: 'platform' });
    }

    // Redirect back to the app
    res.redirect(`${CLIENT_REDIRECT}/media?google_connected=true`);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.redirect(`${CLIENT_REDIRECT}/media?google_error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/google-photos/session — create a picker session
router.post('/session', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const session = await createSession(accessToken);
    console.log('Picker session created:', session.id);

    res.json({
      sessionId: session.id,
      pickerUri: session.pickerUri,
      expireTime: session.expireTime,
    });
  } catch (err) {
    console.error('Create session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-photos/session/:id — poll session status
router.get('/session/:id', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const session = await getSession(accessToken, req.params.id);

    res.json({
      sessionId: session.id,
      pickerUri: session.pickerUri,
      mediaItemsSet: session.mediaItemsSet || false,
    });
  } catch (err) {
    console.error('Get session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-photos/session/:id/media — list selected media items
router.get('/session/:id/media', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const { pageToken } = req.query;
    const data = await listSessionMediaItems(accessToken, req.params.id, pageToken);

    const items = (data.mediaItems || []).map(item => formatPickerMediaItem(item));

    res.json({
      items,
      nextPageToken: data.nextPageToken || null,
    });
  } catch (err) {
    console.error('List session media error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/check-duplicates — check which items are already imported
router.post('/check-duplicates', async (req, res) => {
  try {
    const { googleIds } = req.body;
    if (!googleIds || !googleIds.length) {
      return res.json({ duplicates: [] });
    }

    if (!isSupabaseConfigured()) {
      return res.json({ duplicates: [] });
    }

    const { data: existing } = await supabase
      .from('media_assets')
      .select('google_photos_id')
      .in('google_photos_id', googleIds);

    const duplicateIds = new Set((existing || []).map(e => e.google_photos_id));
    res.json({ duplicates: [...duplicateIds] });
  } catch (err) {
    console.error('Check duplicates error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/import — import selected items into GlowStack (batch)
// Downloads images to Supabase Storage for permanent URLs
router.post('/import', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    if (!isSupabaseConfigured()) {
      return res.json({
        imported: items.length,
        message: 'Demo mode — items would be imported with Supabase configured',
      });
    }

    // 1. Batch check for existing items (single query)
    const googleIds = items.map(i => i.id);
    const { data: existing } = await supabase
      .from('media_assets')
      .select('id, google_photos_id')
      .in('google_photos_id', googleIds);

    const existingIds = new Set((existing || []).map(e => e.google_photos_id));

    // 2. Filter to only new items
    const newItems = items.filter(i => !existingIds.has(i.id));
    const alreadyCount = items.length - newItems.length;

    if (newItems.length === 0) {
      return res.json({
        imported: 0,
        alreadyExisted: alreadyCount,
        message: 'All items are already in your library',
      });
    }

    // 3. Get access token for authenticated image downloads
    const accessToken = await getValidToken();
    if (!accessToken) {
      return res.status(401).json({ error: 'Google Photos not connected — cannot download images' });
    }

    // 4. Download media to Supabase Storage (with auth headers)
    // Process items ONE AT A TIME to avoid overwhelming the serverless function
    // with parallel video downloads that can timeout
    const processedItems = [];

    for (const item of newItems) {
      try {
        const isVideo = item.type === 'VIDEO';
        const filename = item.filename || `photo_${item.id}.jpg`;
        const thumbPath = `google-photos/${item.id}/thumb.jpg`;

        let thumbnailUrl = '';
        let videoUrl = '';
        const baseUrl = item.baseUrl || '';

        if (baseUrl) {
          // Download thumbnail for all items
          try {
            const thumbSrc = `${baseUrl}=w400-h400-c`;
            const thumbRes = await fetch(thumbSrc, {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(15000), // 15s timeout for thumbnails
            });
            if (thumbRes.ok) {
              const buffer = Buffer.from(await thumbRes.arrayBuffer());
              const uploaded = await uploadFile('thumbnails', thumbPath, buffer, 'image/jpeg');
              thumbnailUrl = uploaded.publicUrl;
            } else {
              console.error(`Thumb download failed for ${item.id}: ${thumbRes.status}`);
            }
          } catch (err) {
            console.error(`Thumb error for ${item.id}:`, err.message);
          }

          // For videos, download the full video file SEQUENTIALLY (not in parallel)
          if (isVideo) {
            try {
              const videoSrc = `${baseUrl}=dv`;
              console.log(`Downloading video for ${item.id}...`);
              const videoRes = await fetch(videoSrc, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(240000), // 4 min — leaves time for upload + DB within 5 min function limit
              });
              if (videoRes.ok) {
                const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
                const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
                console.log(`Video ${item.id}: ${sizeMB}MB — download OK`);
                // Only store if under 50MB (Supabase media bucket limit)
                if (videoBuffer.length <= 50 * 1024 * 1024) {
                  const ext = (item.mimeType || 'video/mp4').includes('quicktime') ? 'mov' : 'mp4';
                  const videoPath = `google-photos/${item.id}/video.${ext}`;
                  const uploadedVideo = await uploadFile('media', videoPath, videoBuffer, item.mimeType || 'video/mp4');
                  videoUrl = uploadedVideo.publicUrl;
                  console.log(`Video ${item.id}: uploaded to storage OK`);
                } else {
                  console.warn(`Video ${item.id} too large (${sizeMB}MB), skipping full download`);
                }
              } else {
                console.error(`Video download FAILED for ${item.id}: HTTP ${videoRes.status}`);
              }
            } catch (videoErr) {
              console.error(`Video download ERROR for ${item.id}:`, videoErr.message);
            }
          }
        }

        // If video download failed, DON'T insert — report separately
        if (isVideo && !videoUrl) {
          console.warn(`Video ${item.id}: skipping DB insert — full video file not downloaded`);
          processedItems.push({
            _skipped: true,
            _googleId: item.id,
            _filename: filename,
            _thumbnailUrl: thumbnailUrl,
          });
        } else {
          processedItems.push({
            _skipped: false,
            _googleId: item.id,
            file_name: filename,
            file_url: videoUrl || thumbnailUrl,
            thumbnail_url: thumbnailUrl,
            file_type: isVideo ? 'video' : 'image',
            mime_type: item.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
            source: 'google_photos',
            source_url: item.productUrl || null,
            google_photos_id: item.id,
            title: filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            width: item.width || null,
            height: item.height || null,
            captured_at: item.createTime || null,
          });
        }
      } catch (itemErr) {
        console.error(`Failed to process item ${item.id}:`, itemErr.message);
      }
    }

    // Separate successful items from failed video downloads
    const successItems = processedItems.filter(p => !p._skipped);
    const failedVideoItems = processedItems.filter(p => p._skipped);

    // 5. Insert only successful items
    let inserted = [];
    if (successItems.length > 0) {
      const insertItems = successItems.map(({ _skipped, _googleId, ...rest }) => rest);
      const { data, error } = await supabase
        .from('media_assets')
        .insert(insertItems)
        .select('id, file_name, google_photos_id, file_type');

      if (error) throw error;
      inserted = data || [];
    }

    res.json({
      imported: inserted.length,
      alreadyExisted: alreadyCount,
      items: inserted.map(a => ({
        id: a.id,
        status: 'imported',
        filename: a.file_name,
        googlePhotosId: a.google_photos_id,
      })),
      failedVideos: failedVideoItems.map(f => ({
        googlePhotosId: f._googleId,
        filename: f._filename,
        thumbnailUrl: f._thumbnailUrl,
      })),
    });
  } catch (err) {
    console.error('Google Photos import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/import-thumbnail-only — import a video with just its thumbnail (no full file)
router.post('/import-thumbnail-only', async (req, res) => {
  try {
    const { items } = req.body; // [{ googlePhotosId, filename, thumbnailUrl, mimeType, width, height, createTime, productUrl }]
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const insertItems = items.map(item => ({
      file_name: item.filename,
      file_url: item.thumbnailUrl,
      thumbnail_url: item.thumbnailUrl,
      file_type: 'video',
      mime_type: item.mimeType || 'video/mp4',
      source: 'google_photos',
      source_url: item.productUrl || null,
      google_photos_id: item.googlePhotosId,
      title: (item.filename || 'video').replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      width: item.width || null,
      height: item.height || null,
      captured_at: item.createTime || null,
    }));

    const { data: inserted, error } = await supabase
      .from('media_assets')
      .insert(insertItems)
      .select('id, file_name');

    if (error) throw error;

    res.json({
      imported: inserted.length,
      items: inserted.map(a => ({ id: a.id, filename: a.file_name })),
    });
  } catch (err) {
    console.error('Thumbnail-only import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/retry-video — re-download full video file for an asset that failed
// Requires an active picker session (baseUrl from the picker) or a new session
router.post('/retry-video', async (req, res) => {
  try {
    const { assetId, baseUrl } = req.body;
    if (!assetId || !baseUrl) {
      return res.status(400).json({ error: 'assetId and baseUrl are required' });
    }

    // Verify asset exists and is a video without full file
    const { data: asset, error: assetErr } = await supabase
      .from('media_assets')
      .select('id, file_url, thumbnail_url, file_type, google_photos_id, mime_type')
      .eq('id', assetId)
      .single();

    if (assetErr || !asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (asset.file_type !== 'video') {
      return res.status(400).json({ error: 'Asset is not a video' });
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return res.status(401).json({ error: 'Google Photos not connected' });
    }

    // Download the full video
    const videoSrc = `${baseUrl}=dv`;
    console.log(`Retry video download for asset ${assetId}...`);
    const videoRes = await fetch(videoSrc, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(240000), // 4 min timeout for retry
    });

    if (!videoRes.ok) {
      console.error(`Retry video download FAILED for ${assetId}: HTTP ${videoRes.status}`);
      return res.status(502).json({ error: `Video download failed: HTTP ${videoRes.status}` });
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
    console.log(`Retry video ${assetId}: ${sizeMB}MB`);

    if (videoBuffer.length > 50 * 1024 * 1024) {
      return res.status(413).json({ error: `Video too large (${sizeMB}MB). Maximum is 50MB.` });
    }

    const ext = (asset.mime_type || 'video/mp4').includes('quicktime') ? 'mov' : 'mp4';
    const videoPath = `google-photos/${asset.google_photos_id}/video.${ext}`;
    const uploadedVideo = await uploadFile('media', videoPath, videoBuffer, asset.mime_type || 'video/mp4');

    // Update the asset record with the real video URL
    const { error: updateErr } = await supabase
      .from('media_assets')
      .update({ file_url: uploadedVideo.publicUrl })
      .eq('id', assetId);

    if (updateErr) throw updateErr;

    console.log(`Retry video ${assetId}: uploaded OK — ${uploadedVideo.publicUrl.slice(-40)}`);
    res.json({ success: true, assetId, fileUrl: uploadedVideo.publicUrl });
  } catch (err) {
    console.error('Retry video download error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/cleanup — remove media assets with broken/empty URLs from google_photos source
router.post('/cleanup', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ deleted: 0 });
    }

    // Delete google_photos assets that have empty or expired base URLs
    const { data: broken, error: fetchErr } = await supabase
      .from('media_assets')
      .select('id')
      .eq('source', 'google_photos')
      .or('file_url.is.null,file_url.eq.');

    if (fetchErr) throw fetchErr;

    if (broken && broken.length > 0) {
      const ids = broken.map(b => b.id);
      const { error: delErr } = await supabase
        .from('media_assets')
        .delete()
        .in('id', ids);
      if (delErr) throw delErr;
      return res.json({ deleted: ids.length });
    }

    res.json({ deleted: 0 });
  } catch (err) {
    console.error('Cleanup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/refresh-urls — refresh expired Google Photos URLs using Picker session
router.post('/refresh-urls', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    if (!isSupabaseConfigured()) {
      return res.json({ refreshed: 0 });
    }

    // Get all google_photos assets
    const { data: assets } = await supabase
      .from('media_assets')
      .select('id, google_photos_id, file_url')
      .eq('source', 'google_photos')
      .not('google_photos_id', 'is', null);

    if (!assets || assets.length === 0) {
      return res.json({ refreshed: 0 });
    }

    // Note: The Picker API doesn't let us re-fetch individual items by ID.
    // Expired URLs are a known limitation. We mark them so the UI can show placeholders.
    // A future improvement would download images to Supabase Storage during import.

    res.json({
      total: assets.length,
      message: 'Google Photos URLs expire after ~1 hour. Consider re-importing photos to refresh them.',
    });
  } catch (err) {
    console.error('Refresh URLs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/google-photos/session/:id — clean up session
router.delete('/session/:id', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (accessToken) {
      await deleteSession(accessToken, req.params.id);
    }
    res.json({ message: 'Session deleted' });
  } catch (err) {
    res.json({ message: 'Session cleanup attempted' });
  }
});

// POST /api/google-photos/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      await supabase
        .from('platform_connections')
        .update({
          is_connected: false,
          metadata: {},
          account_username: null,
        })
        .eq('platform', 'google_photos');
    }
    res.json({ message: 'Google Photos disconnected' });
  } catch (err) {
    console.error('Google Photos disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Format a Picker API media item
function formatPickerMediaItem(item) {
  const type = item.type || 'PHOTO'; // PHOTO or VIDEO
  const mediaFile = item.mediaFile || {};

  return {
    id: item.id,
    filename: mediaFile.filename || item.id,
    mimeType: mediaFile.mimeType || '',
    type,
    baseUrl: mediaFile.baseUrl || '',
    width: mediaFile.mediaFileMetadata?.width ? parseInt(mediaFile.mediaFileMetadata.width) : null,
    height: mediaFile.mediaFileMetadata?.height ? parseInt(mediaFile.mediaFileMetadata.height) : null,
    createTime: item.createTime || null,
    cameraMake: mediaFile.mediaFileMetadata?.photo?.cameraMake || null,
    cameraModel: mediaFile.mediaFileMetadata?.photo?.cameraModel || null,
  };
}

export default router;
