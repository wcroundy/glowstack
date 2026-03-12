import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import {
  getAuthUrl, exchangeCode, getValidToken,
  listAlbums, listMediaItems, getMediaItem, searchMediaItems,
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
  // Pass the auth token as state so we can verify the callback
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
    console.log('Token keys:', Object.keys(tokens));

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

// GET /api/google-photos/albums — list albums
router.get('/albums', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const { pageToken } = req.query;
    const data = await listAlbums(accessToken, pageToken);

    res.json({
      albums: (data.albums || []).map(a => ({
        id: a.id,
        title: a.title,
        itemCount: parseInt(a.mediaItemsCount || '0'),
        coverUrl: a.coverPhotoBaseUrl ? `${a.coverPhotoBaseUrl}=w300-h300-c` : null,
        productUrl: a.productUrl,
      })),
      nextPageToken: data.nextPageToken || null,
    });
  } catch (err) {
    console.error('Google Photos albums error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-photos/media — list media items
router.get('/media', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const { albumId, pageSize = 25, pageToken } = req.query;
    const data = await listMediaItems(accessToken, {
      albumId,
      pageSize: parseInt(pageSize),
      pageToken,
    });

    res.json({
      items: (data.mediaItems || []).map(formatMediaItem),
      nextPageToken: data.nextPageToken || null,
    });
  } catch (err) {
    console.error('Google Photos media error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/google-photos/media/:id — get a single media item
router.get('/media/:id', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const item = await getMediaItem(accessToken, req.params.id);
    res.json(formatMediaItem(item));
  } catch (err) {
    console.error('Google Photos media/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/google-photos/import — import selected items into GlowStack
router.post('/import', async (req, res) => {
  try {
    const accessToken = await getValidToken();
    if (!accessToken) return res.status(401).json({ error: 'Google Photos not connected' });

    const { itemIds } = req.body;
    if (!itemIds || !itemIds.length) {
      return res.status(400).json({ error: 'No items selected' });
    }

    if (!isSupabaseConfigured()) {
      return res.json({
        imported: itemIds.length,
        message: 'Demo mode — items would be imported with Supabase configured',
      });
    }

    const imported = [];
    for (const id of itemIds) {
      try {
        const item = await getMediaItem(accessToken, id);
        const formatted = formatMediaItem(item);

        // Check if already imported
        const { data: existing } = await supabase
          .from('media_assets')
          .select('id')
          .eq('google_photos_id', id)
          .single();

        if (existing) {
          imported.push({ id: existing.id, status: 'already_exists', filename: formatted.filename });
          continue;
        }

        // Create media asset record
        const { data: asset, error } = await supabase
          .from('media_assets')
          .insert({
            file_name: formatted.filename,
            file_url: formatted.fullUrl,
            thumbnail_url: formatted.thumbnailUrl,
            file_type: formatted.mediaType === 'VIDEO' ? 'video' : 'image',
            mime_type: formatted.mimeType,
            source: 'google_photos',
            google_photos_id: id,
            title: formatted.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            width: formatted.width,
            height: formatted.height,
            captured_at: formatted.creationTime,
          })
          .select()
          .single();

        if (error) throw error;
        imported.push({ id: asset.id, status: 'imported', filename: formatted.filename });
      } catch (itemErr) {
        imported.push({ id, status: 'error', error: itemErr.message });
      }
    }

    res.json({ imported: imported.filter(i => i.status === 'imported').length, items: imported });
  } catch (err) {
    console.error('Google Photos import error:', err.message);
    res.status(500).json({ error: err.message });
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

// Format a Google Photos media item for our API
function formatMediaItem(item) {
  const isVideo = item.mediaMetadata?.video != null;
  const baseUrl = item.baseUrl || '';

  return {
    googleId: item.id,
    filename: item.filename,
    mimeType: item.mimeType,
    mediaType: isVideo ? 'VIDEO' : 'PHOTO',
    description: item.description || '',
    thumbnailUrl: baseUrl ? `${baseUrl}=w300-h300-c` : '',
    fullUrl: baseUrl ? (isVideo ? `${baseUrl}=dv` : `${baseUrl}=w2048-h2048`) : '',
    width: parseInt(item.mediaMetadata?.width || 0),
    height: parseInt(item.mediaMetadata?.height || 0),
    creationTime: item.mediaMetadata?.creationTime || null,
    cameraMake: item.mediaMetadata?.photo?.cameraMake || null,
    cameraModel: item.mediaMetadata?.photo?.cameraModel || null,
    fps: item.mediaMetadata?.video?.fps || null,
    productUrl: item.productUrl,
  };
}

export default router;
