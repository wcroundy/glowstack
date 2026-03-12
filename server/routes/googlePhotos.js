import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
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

// POST /api/google-photos/import — import selected items into GlowStack
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

    const imported = [];
    for (const item of items) {
      try {
        // Check if already imported by google_photos_id
        const { data: existing } = await supabase
          .from('media_assets')
          .select('id')
          .eq('google_photos_id', item.id)
          .single();

        if (existing) {
          imported.push({ id: existing.id, status: 'already_exists', filename: item.filename });
          continue;
        }

        // Create media asset record
        const { data: asset, error } = await supabase
          .from('media_assets')
          .insert({
            file_name: item.filename || 'untitled',
            file_url: item.baseUrl || '',
            thumbnail_url: item.baseUrl ? `${item.baseUrl}=w300-h300-c` : '',
            file_type: item.type === 'VIDEO' ? 'video' : 'image',
            mime_type: item.mimeType || (item.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg'),
            source: 'google_photos',
            google_photos_id: item.id,
            title: (item.filename || 'untitled').replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
            width: item.width || null,
            height: item.height || null,
            captured_at: item.createTime || null,
          })
          .select()
          .single();

        if (error) throw error;
        imported.push({ id: asset.id, status: 'imported', filename: item.filename });
      } catch (itemErr) {
        imported.push({ id: item.id, status: 'error', error: itemErr.message });
      }
    }

    res.json({ imported: imported.filter(i => i.status === 'imported').length, items: imported });
  } catch (err) {
    console.error('Google Photos import error:', err.message);
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
