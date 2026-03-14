import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import {
  isMetaConfigured, getAuthUrl, exchangeCode, getPages,
  getInstagramAccount, getInstagramMedia, getInstagramMediaInsights,
  getFacebookPosts, getFacebookPostInsights, getValidPageToken,
  saveConnection,
} from '../services/meta.js';

const router = Router();

const CLIENT_REDIRECT = process.env.CLIENT_URL || 'http://localhost:5173';

// GET /api/meta/status — check connection status
router.get('/status', async (req, res) => {
  try {
    if (!isMetaConfigured()) {
      return res.json({
        configured: false,
        connected: false,
        message: 'Meta API credentials not configured. Add META_APP_ID and META_APP_SECRET to env.',
      });
    }

    if (!isSupabaseConfigured()) {
      return res.json({ configured: true, connected: false, message: 'Supabase not configured' });
    }

    const { data: connection } = await supabase
      .from('platform_connections')
      .select('is_connected, metadata')
      .eq('platform', 'meta')
      .single();

    const connected = !!(connection?.is_connected && connection?.metadata?.page_access_token);

    res.json({
      configured: true,
      connected,
      instagram: connected ? {
        username: connection.metadata?.ig_username,
        name: connection.metadata?.ig_name,
        followers: connection.metadata?.ig_followers,
        profilePicture: connection.metadata?.ig_profile_picture,
      } : null,
      facebook: connected ? {
        pageName: connection.metadata?.page_name,
        pageId: connection.metadata?.page_id,
      } : null,
    });
  } catch (err) {
    console.error('Meta status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/auth-url — generate OAuth URL
router.get('/auth-url', (req, res) => {
  if (!isMetaConfigured()) {
    return res.status(400).json({ error: 'Meta API credentials not configured' });
  }
  const url = getAuthUrl('meta_connect');
  res.json({ url });
});

// GET /api/auth/meta/callback — OAuth callback (browser redirect, no auth middleware)
router.get('/callback', async (req, res) => {
  try {
    const { code, error: fbError, error_description } = req.query;

    if (fbError) {
      console.error('Meta OAuth error:', fbError, error_description);
      return res.redirect(`${CLIENT_REDIRECT}/settings?meta_error=${encodeURIComponent(error_description || fbError)}`);
    }

    if (!code) {
      return res.redirect(`${CLIENT_REDIRECT}/settings?meta_error=no_code`);
    }

    // Exchange code for long-lived user token
    const tokenData = await exchangeCode(code);

    // Get user's Facebook Pages
    const pages = await getPages(tokenData.access_token);

    if (!pages || pages.length === 0) {
      return res.redirect(`${CLIENT_REDIRECT}/settings?meta_error=${encodeURIComponent('No Facebook Pages found. Make sure your Instagram Business account is connected to a Facebook Page.')}`);
    }

    // Use the first page that has an Instagram Business Account connected
    let selectedPage = pages.find(p => p.instagram_business_account);
    if (!selectedPage) {
      // Fall back to first page
      selectedPage = pages[0];
    }

    const metadata = {
      user_access_token: tokenData.access_token,
      token_expires_in: tokenData.expires_in,
      token_obtained_at: new Date().toISOString(),
      page_id: selectedPage.id,
      page_name: selectedPage.name,
      page_access_token: selectedPage.access_token,
    };

    // If there's a connected Instagram Business Account, get its info
    if (selectedPage.instagram_business_account) {
      const igAccount = await getInstagramAccount(
        selectedPage.instagram_business_account.id,
        selectedPage.access_token
      );
      metadata.ig_user_id = igAccount.id;
      metadata.ig_username = igAccount.username;
      metadata.ig_name = igAccount.name;
      metadata.ig_followers = igAccount.followers_count;
      metadata.ig_following = igAccount.follows_count;
      metadata.ig_media_count = igAccount.media_count;
      metadata.ig_profile_picture = igAccount.profile_picture_url;
      metadata.ig_bio = igAccount.biography;
    }

    // Save to Supabase
    await saveConnection(metadata);

    res.redirect(`${CLIENT_REDIRECT}/settings?meta_connected=true`);
  } catch (err) {
    console.error('Meta callback error:', err.message);
    res.redirect(`${CLIENT_REDIRECT}/settings?meta_error=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/meta/disconnect — disconnect Meta
router.post('/disconnect', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Disconnected (demo)' });
    }
    await supabase
      .from('platform_connections')
      .update({
        is_connected: false,
        access_token: null,
        metadata: {},
      })
      .eq('platform', 'meta');
    res.json({ message: 'Meta disconnected' });
  } catch (err) {
    console.error('Meta disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meta/sync/instagram — sync Instagram posts and insights
router.post('/sync/instagram', async (req, res) => {
  try {
    const { pageAccessToken, igUserId } = await getValidPageToken();

    if (!igUserId) {
      return res.status(400).json({ error: 'No Instagram Business Account connected to this Page' });
    }

    // Log sync start
    let syncLogId = null;
    if (isSupabaseConfigured()) {
      const { data: log } = await supabase
        .from('meta_sync_log')
        .insert({ platform: 'instagram', sync_type: 'full' })
        .select()
        .single();
      syncLogId = log?.id;
    }

    // Fetch posts (paginate up to 200)
    let allPosts = [];
    let after = null;
    let pages = 0;
    const maxPages = 4; // 4 × 50 = 200 posts max

    do {
      const result = await getInstagramMedia(igUserId, pageAccessToken, 50, after);
      allPosts = allPosts.concat(result.data || []);
      after = result.paging?.cursors?.after;
      pages++;
    } while (after && pages < maxPages);

    // Process each post: get insights and upsert
    let synced = 0;
    for (const post of allPosts) {
      const insights = await getInstagramMediaInsights(post.id, post.media_type, pageAccessToken);

      const row = {
        ig_media_id: post.id,
        media_type: post.media_type,
        media_product_type: post.media_product_type,
        caption: post.caption,
        permalink: post.permalink,
        timestamp: post.timestamp,
        like_count: post.like_count || 0,
        comments_count: post.comments_count || 0,
        thumbnail_url: post.thumbnail_url,
        impressions: insights?.impressions || 0,
        reach: insights?.reach || 0,
        saved: insights?.saved || 0,
        shares: insights?.shares || 0,
        engagement: (insights?.likes || 0) + (insights?.comments || 0) + (insights?.saved || 0) + (insights?.shares || 0),
        plays: insights?.plays || 0,
        raw_insights: insights || {},
        last_synced_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('instagram_insights')
        .upsert(row, { onConflict: 'ig_media_id' });

      if (!error) synced++;
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('meta_sync_log')
        .update({
          status: 'completed',
          posts_synced: synced,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }

    res.json({
      synced,
      total: allPosts.length,
      message: `Synced ${synced} Instagram posts with insights`,
    });
  } catch (err) {
    console.error('Instagram sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meta/sync/facebook — sync Facebook Page posts and insights
router.post('/sync/facebook', async (req, res) => {
  try {
    const { pageAccessToken, pageId } = await getValidPageToken();

    // Log sync start
    let syncLogId = null;
    if (isSupabaseConfigured()) {
      const { data: log } = await supabase
        .from('meta_sync_log')
        .insert({ platform: 'facebook', sync_type: 'full' })
        .select()
        .single();
      syncLogId = log?.id;
    }

    // Fetch posts
    let allPosts = [];
    let after = null;
    let pages = 0;
    const maxPages = 4;

    do {
      const result = await getFacebookPosts(pageId, pageAccessToken, 50, after);
      allPosts = allPosts.concat(result.data || []);
      after = result.paging?.cursors?.after;
      pages++;
    } while (after && pages < maxPages);

    // Process each post
    let synced = 0;
    for (const post of allPosts) {
      const insights = await getFacebookPostInsights(post.id, pageAccessToken);

      const reactions = insights?.post_reactions_by_type_total || {};
      const reactionsTotal = Object.values(reactions).reduce((sum, v) => sum + (v || 0), 0);

      const row = {
        fb_post_id: post.id,
        message: post.message,
        permalink_url: post.permalink_url,
        post_type: post.type,
        created_time: post.created_time,
        full_picture: post.full_picture,
        impressions: insights?.post_impressions || 0,
        reach: insights?.post_engaged_users || 0,
        engagement: insights?.post_engaged_users || 0,
        reactions_total: reactionsTotal,
        comments_count: 0,
        shares_count: post.shares?.count || 0,
        clicks: insights?.post_clicks || 0,
        raw_insights: insights || {},
        last_synced_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('facebook_insights')
        .upsert(row, { onConflict: 'fb_post_id' });

      if (!error) synced++;
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('meta_sync_log')
        .update({
          status: 'completed',
          posts_synced: synced,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLogId);
    }

    res.json({
      synced,
      total: allPosts.length,
      message: `Synced ${synced} Facebook posts with insights`,
    });
  } catch (err) {
    console.error('Facebook sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/instagram/posts — get stored Instagram posts with insights
router.get('/instagram/posts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort || 'timestamp';
    const order = req.query.order === 'asc' ? true : false;

    const { data, error, count } = await supabase
      .from('instagram_insights')
      .select('*', { count: 'exact' })
      .order(sort, { ascending: order })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (err) {
    console.error('IG posts GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/instagram/summary — aggregated Instagram stats
router.get('/instagram/summary', async (req, res) => {
  try {
    // Get total posts and aggregate metrics
    const { data: posts, error } = await supabase
      .from('instagram_insights')
      .select('like_count, comments_count, impressions, reach, saved, shares, engagement, plays, media_type');

    if (error) throw error;

    const summary = {
      totalPosts: posts?.length || 0,
      totalLikes: 0,
      totalComments: 0,
      totalImpressions: 0,
      totalReach: 0,
      totalSaved: 0,
      totalShares: 0,
      totalEngagement: 0,
      totalPlays: 0,
      byType: {},
    };

    (posts || []).forEach(p => {
      summary.totalLikes += p.like_count || 0;
      summary.totalComments += p.comments_count || 0;
      summary.totalImpressions += p.impressions || 0;
      summary.totalReach += p.reach || 0;
      summary.totalSaved += p.saved || 0;
      summary.totalShares += p.shares || 0;
      summary.totalEngagement += p.engagement || 0;
      summary.totalPlays += p.plays || 0;

      const type = p.media_type || 'OTHER';
      if (!summary.byType[type]) {
        summary.byType[type] = { count: 0, likes: 0, comments: 0, reach: 0, engagement: 0 };
      }
      summary.byType[type].count++;
      summary.byType[type].likes += p.like_count || 0;
      summary.byType[type].comments += p.comments_count || 0;
      summary.byType[type].reach += p.reach || 0;
      summary.byType[type].engagement += p.engagement || 0;
    });

    // Average engagement rate
    summary.avgEngagementRate = summary.totalImpressions > 0
      ? ((summary.totalEngagement / summary.totalImpressions) * 100).toFixed(2)
      : '0.00';

    res.json(summary);
  } catch (err) {
    console.error('IG summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/facebook/posts — get stored Facebook posts with insights
router.get('/facebook/posts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const { data, error, count } = await supabase
      .from('facebook_insights')
      .select('*', { count: 'exact' })
      .order('created_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (err) {
    console.error('FB posts GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/facebook/summary — aggregated Facebook stats
router.get('/facebook/summary', async (req, res) => {
  try {
    const { data: posts, error } = await supabase
      .from('facebook_insights')
      .select('impressions, reach, engagement, reactions_total, comments_count, shares_count, clicks');

    if (error) throw error;

    const summary = {
      totalPosts: posts?.length || 0,
      totalImpressions: 0,
      totalReach: 0,
      totalEngagement: 0,
      totalReactions: 0,
      totalComments: 0,
      totalShares: 0,
      totalClicks: 0,
    };

    (posts || []).forEach(p => {
      summary.totalImpressions += p.impressions || 0;
      summary.totalReach += p.reach || 0;
      summary.totalEngagement += p.engagement || 0;
      summary.totalReactions += p.reactions_total || 0;
      summary.totalComments += p.comments_count || 0;
      summary.totalShares += p.shares_count || 0;
      summary.totalClicks += p.clicks || 0;
    });

    res.json(summary);
  } catch (err) {
    console.error('FB summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/sync-log — get sync history
router.get('/sync-log', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('meta_sync_log')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Sync log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
