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

    // 3. Download ONLY thumbnails to Supabase Storage (fast, small files)
    // Full-size images stay as Google references — thumbnails are what we need for browsing
    const BATCH_SIZE = 10; // concurrent thumbnail downloads
    const processedItems = [];

    // Log first item to debug URL format
    if (newItems.length > 0) {
      console.log('First item to import:', JSON.stringify(newItems[0], null, 2));
    }

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const isVideo = item.type === 'VIDEO';
          const filename = item.filename || `photo_${item.id}.jpg`;
          const thumbPath = `google-photos/${item.id}/thumb.jpg`;

          let thumbnailUrl = '';
          const baseUrl = item.baseUrl || '';

          // Download just the thumbnail (~10-30KB each, very fast)
          if (baseUrl) {
            try {
              const thumbSrc = baseUrl.includes('=') ? baseUrl : `${baseUrl}=w400-h400-c`;
              const thumbRes = await fetch(thumbSrc);
              if (thumbRes.ok) {
                const buffer = Buffer.from(await thumbRes.arrayBuffer());
                const uploaded = await uploadFile('thumbnails', thumbPath, buffer, 'image/jpeg');
                thumbnailUrl = uploaded.publicUrl;
              } else {
                console.error(`Thumb download failed for ${item.id}: ${thumbRes.status}`);
                // Fallback: try plain baseUrl
                const retryRes = await fetch(baseUrl);
                if (retryRes.ok) {
                  const buffer = Buffer.from(await retryRes.arrayBuffer());
                  const uploaded = await uploadFile('thumbnails', thumbPath, buffer, 'image/jpeg');
                  thumbnailUrl = uploaded.publicUrl;
                }
              }
            } catch (err) {
              console.error(`Thumb error for ${item.id}:`, err.message);
            }
          }

          return {
            file_name: filename,
            file_url: thumbnailUrl, // Use thumbnail as display URL for now
            thumbnail_url: thumbnailUrl,
            file_type: isVideo ? 'video' : 'image',
            mime_type: item.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
            source: 'google_photos',
            google_photos_id: item.id,
            title: filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            width: item.width || null,
            height: item.height || null,
            captured_at: item.createTime || null,
          };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          processedItems.push(result.value);
        } else {
          console.error('Item processing rejected:', result.reason);
        }
      }
    }

    if (processedItems.length === 0) {
      return res.json({ imported: 0, alreadyExisted: alreadyCount, error: 'Failed to process any items' });
    }

    // 4. Batch insert all processed items
    const { data: inserted, error } = await supabase
      .from('media_assets')
      .insert(processedItems)
      .select('id, file_name');

    if (error) throw error;

    res.json({
      imported: inserted.length,
      alreadyExisted: alreadyCount,
      items: inserted.map(a => ({ id: a.id, status: 'imported', filename: a.file_name })),
    });
  } catch (err) {
    console.error('Google Photos import error:', err.message);
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
