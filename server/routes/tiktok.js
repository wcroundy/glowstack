import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import {
  isTikTokConfigured, getAuthUrl, exchangeCode,
  getUserInfo, getUserVideos, getValidToken, saveConnection,
} from '../services/tiktok.js';

const router = Router();

const CLIENT_REDIRECT = process.env.CLIENT_URL || 'http://localhost:5173';

// GET /api/tiktok/status — check connection status
router.get('/status', async (req, res) => {
  try {
    if (!isTikTokConfigured()) {
      return res.json({
        configured: false,
        connected: false,
        message: 'TikTok API credentials not configured. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to env.',
      });
    }

    if (!isSupabaseConfigured()) {
      return res.json({ configured: true, connected: false });
    }

    const { data: connection } = await supabase
      .from('platform_connections')
      .select('is_connected, metadata')
      .eq('platform', 'tiktok')
      .single();

    const connected = !!(connection?.is_connected && connection?.metadata?.access_token);

    res.json({
      configured: true,
      connected,
      account: connected ? {
        displayName: connection.metadata?.display_name,
        username: connection.metadata?.username,
        avatar: connection.metadata?.avatar_url,
        followers: connection.metadata?.follower_count,
        likes: connection.metadata?.likes_count,
        videoCount: connection.metadata?.video_count,
        isVerified: connection.metadata?.is_verified,
      } : null,
    });
  } catch (err) {
    console.error('TikTok status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tiktok/auth-url — generate OAuth URL
router.get('/auth-url', (req, res) => {
  if (!isTikTokConfigured()) {
    return res.status(400).json({ error: 'TikTok API credentials not configured' });
  }
  const { url } = getAuthUrl();
  res.json({ url });
});

// GET /api/auth/tiktok/callback — OAuth callback (browser redirect, no auth middleware)
router.get('/callback', async (req, res) => {
  try {
    const { code, error: tkError, error_description } = req.query;

    if (tkError) {
      console.error('TikTok OAuth error:', tkError, error_description);
      return res.redirect(`${CLIENT_REDIRECT}/settings?tiktok_error=${encodeURIComponent(error_description || tkError)}`);
    }

    if (!code) {
      return res.redirect(`${CLIENT_REDIRECT}/settings?tiktok_error=no_code`);
    }

    // Exchange code for tokens
    const tokenData = await exchangeCode(code);

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 86400;
    const openId = tokenData.open_id;

    // Get user profile
    const userInfo = await getUserInfo(accessToken);

    const metadata = {
      open_id: openId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      display_name: userInfo.display_name,
      username: userInfo.display_name, // TikTok doesn't always return username separately
      avatar_url: userInfo.avatar_url_100 || userInfo.avatar_url,
      bio: userInfo.bio_description,
      profile_link: userInfo.profile_deep_link,
      is_verified: userInfo.is_verified,
      follower_count: userInfo.follower_count,
      following_count: userInfo.following_count,
      likes_count: userInfo.likes_count,
      video_count: userInfo.video_count,
    };

    // Save to Supabase
    await saveConnection(metadata);

    res.redirect(`${CLIENT_REDIRECT}/settings?tiktok_connected=true`);
  } catch (err) {
    console.error('TikTok callback error:', err.message);
    res.redirect(`${CLIENT_REDIRECT}/settings?tiktok_error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/tiktok/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Disconnected (demo)' });
    }
    await supabase
      .from('platform_connections')
      .update({ is_connected: false, access_token: null, refresh_token: null, metadata: {} })
      .eq('platform', 'tiktok');
    res.json({ message: 'TikTok disconnected' });
  } catch (err) {
    console.error('TikTok disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tiktok/sync — sync TikTok videos and stats
router.post('/sync', async (req, res) => {
  try {
    const accessToken = await getValidToken();

    // Log sync start
    let syncLogId = null;
    if (isSupabaseConfigured()) {
      const { data: log } = await supabase
        .from('meta_sync_log')
        .insert({ platform: 'tiktok', sync_type: 'full' })
        .select()
        .single();
      syncLogId = log?.id;
    }

    // Fetch videos (paginate up to 200)
    let allVideos = [];
    let cursor = null;
    let pages = 0;
    const maxPages = 10; // 10 × 20 = 200 videos max

    do {
      const result = await getUserVideos(accessToken, cursor, 20);
      const videos = result.videos || [];
      allVideos = allVideos.concat(videos);
      cursor = result.has_more ? result.cursor : null;
      pages++;
    } while (cursor && pages < maxPages);

    // Upsert each video
    let synced = 0;
    for (const video of allVideos) {
      const row = {
        tiktok_video_id: video.id,
        title: video.title || '',
        description: video.video_description || '',
        cover_image_url: video.cover_image_url,
        share_url: video.share_url,
        duration: video.duration || 0,
        create_time: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
        like_count: video.like_count || 0,
        comment_count: video.comment_count || 0,
        share_count: video.share_count || 0,
        view_count: video.view_count || 0,
        raw_data: video,
        last_synced_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('tiktok_insights')
        .upsert(row, { onConflict: 'tiktok_video_id' });

      if (!error) synced++;
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('meta_sync_log')
        .update({ status: 'completed', posts_synced: synced, completed_at: new Date().toISOString() })
        .eq('id', syncLogId);
    }

    res.json({
      synced,
      total: allVideos.length,
      message: `Synced ${synced} TikTok videos`,
    });
  } catch (err) {
    console.error('TikTok sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tiktok/videos — get stored TikTok videos
router.get('/videos', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await supabase
      .from('tiktok_insights')
      .select('*', { count: 'exact' })
      .order('create_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (err) {
    console.error('TikTok videos GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tiktok/summary — aggregated TikTok stats
router.get('/summary', async (req, res) => {
  try {
    const { data: videos, error } = await supabase
      .from('tiktok_insights')
      .select('view_count, like_count, comment_count, share_count, duration');

    if (error) throw error;

    const summary = {
      totalVideos: videos?.length || 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalDuration: 0,
    };

    (videos || []).forEach(v => {
      summary.totalViews += v.view_count || 0;
      summary.totalLikes += v.like_count || 0;
      summary.totalComments += v.comment_count || 0;
      summary.totalShares += v.share_count || 0;
      summary.totalDuration += v.duration || 0;
    });

    summary.avgViews = summary.totalVideos > 0 ? Math.round(summary.totalViews / summary.totalVideos) : 0;
    summary.avgEngagement = summary.totalViews > 0
      ? (((summary.totalLikes + summary.totalComments + summary.totalShares) / summary.totalViews) * 100).toFixed(2)
      : '0.00';

    res.json(summary);
  } catch (err) {
    console.error('TikTok summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
