import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import {
  isMetaConfigured, hasAdvancedAccess, getAuthUrl, exchangeCode, getPages,
  getInstagramAccount, getInstagramMedia, getInstagramMediaInsights,
  getInstagramMediaSince, getInstagramAccountInsights,
  getFacebookPosts, getFacebookPostInsights, getFacebookPostsSince,
  getPageInfo, getValidPageToken, getLastSyncTimestamp,
  saveConnection, checkAndRefreshToken,
  parseSignedRequest, handleDataDeletion,
  verifyWebhookSignature, TokenExpiredError,
} from '../services/meta.js';

const router = Router();

const CLIENT_REDIRECT = process.env.CLIENT_URL || 'http://localhost:5173';
const WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'glowstack_verify_token';

// ─── Status & Auth ─────────────────────────────────────────────────────────────

// GET /api/meta/status — check connection status + token health
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
    const metadata = connection?.metadata || {};

    // Calculate token expiry info
    let tokenStatus = null;
    if (connected && metadata.token_obtained_at) {
      const obtainedAt = new Date(metadata.token_obtained_at).getTime();
      const expiresIn = (metadata.token_expires_in || 5184000) * 1000;
      const expiresAt = obtainedAt + expiresIn;
      const daysLeft = Math.floor((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
      tokenStatus = {
        expiresAt: new Date(expiresAt).toISOString(),
        daysRemaining: Math.max(0, daysLeft),
        needsReauth: metadata.needs_reauth || false,
      };
    }

    res.json({
      configured: true,
      connected,
      advancedAccess: hasAdvancedAccess(),
      tokenStatus,
      instagram: connected ? {
        username: metadata.ig_username,
        name: metadata.ig_name,
        followers: metadata.ig_followers,
        profilePicture: metadata.ig_profile_picture,
      } : null,
      facebook: connected ? {
        pageName: metadata.page_name,
        pageId: metadata.page_id,
        followers: metadata.fb_followers || 0,
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

    console.log('Meta callback: exchanging code for token...');
    const tokenData = await exchangeCode(code);
    console.log('Meta callback: token obtained, fetching pages...');

    const pages = await getPages(tokenData.access_token);
    console.log('Meta callback: found', pages?.length || 0, 'pages');

    if (!pages || pages.length === 0) {
      return res.redirect(`${CLIENT_REDIRECT}/settings?meta_error=${encodeURIComponent('No Facebook Pages found. Create a Facebook Page and link your Instagram account to it, then try connecting again.')}`);
    }

    // Use the first page that has an Instagram Business Account connected
    console.log('Meta callback: pages data:', JSON.stringify(pages.map(p => ({
      id: p.id, name: p.name,
      hasAccessToken: !!p.access_token,
      instagram_business_account: p.instagram_business_account || 'NONE',
    }))));
    let selectedPage = pages.find(p => p.instagram_business_account);
    if (!selectedPage) {
      console.log('Meta callback: no page has instagram_business_account, using first page');
      selectedPage = pages[0];
    }

    // Store which scopes were actually granted
    let grantedScopes = [];
    try {
      const permsRes = await fetch(`https://graph.facebook.com/v22.0/me/permissions?access_token=${tokenData.access_token}`);
      const permsData = await permsRes.json();
      grantedScopes = (permsData.data || [])
        .filter(p => p.status === 'granted')
        .map(p => p.permission);
    } catch (e) {
      console.warn('Could not fetch granted permissions:', e.message);
    }

    const metadata = {
      user_access_token: tokenData.access_token,
      token_expires_in: tokenData.expires_in,
      token_obtained_at: new Date().toISOString(),
      page_id: selectedPage.id,
      page_name: selectedPage.name,
      page_access_token: selectedPage.access_token,
      fb_followers: selectedPage.fan_count || 0,
      granted_scopes: grantedScopes,
      needs_reauth: false,
    };

    // If there's a connected Instagram Business Account, try to get its info
    if (selectedPage.instagram_business_account) {
      try {
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
      } catch (igErr) {
        console.warn('Could not fetch Instagram account (may need instagram_basic scope):', igErr.message);
        metadata.ig_user_id = selectedPage.instagram_business_account.id;
      }
    }

    console.log('Meta callback: saving connection for page:', metadata.page_name);
    console.log('Meta callback: granted scopes:', grantedScopes.join(', '));
    await saveConnection(metadata);
    console.log('Meta callback: connection saved successfully');

    res.redirect(`${CLIENT_REDIRECT}/settings?meta_connected=true`);
  } catch (err) {
    console.error('Meta callback error:', err.message, err.stack);
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

// ─── Token Management ──────────────────────────────────────────────────────────

// POST /api/meta/refresh-token — manually trigger token refresh
router.post('/refresh-token', async (req, res) => {
  try {
    const result = await checkAndRefreshToken();
    if (!result) {
      return res.status(400).json({ error: 'No Meta connection found' });
    }
    res.json(result);
  } catch (err) {
    console.error('Token refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync Endpoints ────────────────────────────────────────────────────────────

// POST /api/meta/sync/instagram — sync Instagram posts and insights
router.post('/sync/instagram', async (req, res) => {
  try {
    console.log('Instagram sync: fetching stored connection...');
    const { pageAccessToken, pageId, igUserId } = await getValidPageToken();
    console.log('Instagram sync: pageId=', pageId, 'igUserId=', igUserId);

    if (!igUserId) {
      console.log('Instagram sync: No IG user ID found in stored connection');
      return res.status(400).json({ error: 'No Instagram Business Account connected to this Page. Try disconnecting and reconnecting Meta.' });
    }

    // Determine sync type: incremental if we have prior data, otherwise full
    const syncType = req.query.type || 'auto'; // 'full', 'incremental', or 'auto'
    let lastSync = null;
    let isIncremental = false;

    if (syncType !== 'full') {
      lastSync = await getLastSyncTimestamp('instagram');
      isIncremental = !!(lastSync && syncType !== 'full');
    }

    // Log sync start
    let syncLogId = null;
    if (isSupabaseConfigured()) {
      const { data: log } = await supabase
        .from('meta_sync_log')
        .insert({ platform: 'instagram', sync_type: isIncremental ? 'incremental' : 'full' })
        .select()
        .single();
      syncLogId = log?.id;
    }

    // Fetch posts
    let allPosts = [];
    let after = null;

    do {
      const result = isIncremental
        ? await getInstagramMediaSince(igUserId, pageAccessToken, lastSync, 25, after)
        : await getInstagramMedia(igUserId, pageAccessToken, 25, after);
      allPosts = allPosts.concat(result.data || []);
      after = result.paging?.cursors?.after;
      console.log(`Instagram sync (${isIncremental ? 'incremental' : 'full'}): fetched ${allPosts.length} posts so far...`);
    } while (after);

    // Process posts with optional per-post insights
    console.log(`Instagram sync: saving ${allPosts.length} posts to database...`);
    let synced = 0;
    let insightsFetched = 0;
    const BATCH_SIZE = 50;
    const canFetchInsights = hasAdvancedAccess();

    for (let i = 0; i < allPosts.length; i += BATCH_SIZE) {
      const batch = allPosts.slice(i, i + BATCH_SIZE);

      // Fetch per-post insights if we have advanced access
      const rows = [];
      for (const post of batch) {
        let insights = null;
        if (canFetchInsights) {
          try {
            insights = await getInstagramMediaInsights(post.id, post.media_type, pageAccessToken);
            if (insights) insightsFetched++;
          } catch (insightErr) {
            console.warn(`IG insight fetch failed for ${post.id}:`, insightErr.message);
          }
        }

        rows.push({
          ig_media_id: post.id,
          media_type: post.media_type,
          media_product_type: post.media_product_type,
          caption: post.caption,
          permalink: post.permalink,
          timestamp: post.timestamp,
          like_count: post.like_count || 0,
          comments_count: post.comments_count || 0,
          thumbnail_url: post.thumbnail_url,
          impressions: insights?.impressions ?? 0,
          reach: insights?.reach ?? 0,
          saved: insights?.saved ?? 0,
          shares: insights?.shares ?? 0,
          engagement: insights
            ? (insights.likes || 0) + (insights.comments || 0) + (insights.saved || 0) + (insights.shares || 0)
            : 0,
          plays: insights?.plays ?? 0,
          raw_insights: insights || {},
          last_synced_at: new Date().toISOString(),
        });
      }

      const { error } = await supabase
        .from('instagram_insights')
        .upsert(rows, { onConflict: 'ig_media_id' });

      if (!error) {
        synced += batch.length;
      } else {
        console.error('Instagram batch upsert error:', error.message);
      }
      console.log(`Instagram sync: saved ${synced}/${allPosts.length} posts`);
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

    // Refresh follower counts in stored metadata
    try {
      const [igAccount, pageInfo] = await Promise.all([
        getInstagramAccount(igUserId, pageAccessToken),
        getPageInfo(pageId, pageAccessToken),
      ]);
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('metadata')
        .eq('platform', 'meta')
        .single();
      if (conn?.metadata) {
        await supabase
          .from('platform_connections')
          .update({
            metadata: {
              ...conn.metadata,
              ig_followers: igAccount.followers_count || conn.metadata.ig_followers,
              fb_followers: pageInfo.fan_count || conn.metadata.fb_followers || 0,
            },
          })
          .eq('platform', 'meta');
      }
    } catch (e) {
      console.warn('Could not refresh follower counts during sync:', e.message);
    }

    res.json({
      synced,
      total: allPosts.length,
      syncType: isIncremental ? 'incremental' : 'full',
      insightsFetched,
      advancedAccess: canFetchInsights,
      message: `Synced ${synced} Instagram posts${canFetchInsights ? ` with ${insightsFetched} insights` : ''}`,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired. Please reconnect your Meta account.', needsReauth: true });
    }
    console.error('Instagram sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meta/sync/facebook — sync Facebook Page posts and insights
router.post('/sync/facebook', async (req, res) => {
  try {
    const { pageAccessToken, pageId } = await getValidPageToken();

    // Determine sync type
    const syncType = req.query.type || 'auto';
    let lastSync = null;
    let isIncremental = false;

    if (syncType !== 'full') {
      lastSync = await getLastSyncTimestamp('facebook');
      isIncremental = !!(lastSync && syncType !== 'full');
    }

    // Log sync start
    let syncLogId = null;
    if (isSupabaseConfigured()) {
      const { data: log } = await supabase
        .from('meta_sync_log')
        .insert({ platform: 'facebook', sync_type: isIncremental ? 'incremental' : 'full' })
        .select()
        .single();
      syncLogId = log?.id;
    }

    // Fetch posts
    let allPosts = [];
    let after = null;

    do {
      const result = isIncremental
        ? await getFacebookPostsSince(pageId, pageAccessToken, lastSync, 100, after)
        : await getFacebookPosts(pageId, pageAccessToken, 100, after);
      allPosts = allPosts.concat(result.data || []);
      after = result.paging?.cursors?.after;
      console.log(`Facebook sync (${isIncremental ? 'incremental' : 'full'}): fetched ${allPosts.length} posts so far...`);
    } while (after);

    // Process posts with optional per-post insights
    console.log(`Facebook sync: saving ${allPosts.length} posts to database...`);
    let synced = 0;
    let insightsFetched = 0;
    const BATCH_SIZE = 50;
    const canFetchInsights = hasAdvancedAccess();

    for (let i = 0; i < allPosts.length; i += BATCH_SIZE) {
      const batch = allPosts.slice(i, i + BATCH_SIZE);

      const rows = [];
      for (const post of batch) {
        let insights = null;
        if (canFetchInsights) {
          try {
            insights = await getFacebookPostInsights(post.id, pageAccessToken);
            if (insights) insightsFetched++;
          } catch (insightErr) {
            console.warn(`FB insight fetch failed for ${post.id}:`, insightErr.message);
          }
        }

        const reactionsTotal = insights?.post_reactions_by_type_total
          ? Object.values(insights.post_reactions_by_type_total).reduce((a, b) => a + b, 0)
          : 0;

        rows.push({
          fb_post_id: post.id,
          message: post.message,
          permalink_url: post.permalink_url,
          post_type: null,
          created_time: post.created_time,
          full_picture: post.full_picture,
          impressions: insights?.post_impressions ?? 0,
          reach: 0,
          engagement: insights?.post_engaged_users ?? 0,
          reactions_total: reactionsTotal,
          comments_count: 0,
          shares_count: 0,
          clicks: insights?.post_clicks ?? 0,
          raw_insights: insights || {},
          last_synced_at: new Date().toISOString(),
        });
      }

      const { error } = await supabase
        .from('facebook_insights')
        .upsert(rows, { onConflict: 'fb_post_id' });

      if (!error) {
        synced += batch.length;
      } else {
        console.error('Facebook batch upsert error:', error.message);
      }
      console.log(`Facebook sync: saved ${synced}/${allPosts.length} posts`);
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

    // Refresh follower counts in stored metadata
    try {
      const pageInfo = await getPageInfo(pageId, pageAccessToken);
      const { data: conn } = await supabase
        .from('platform_connections')
        .select('metadata')
        .eq('platform', 'meta')
        .single();
      if (conn?.metadata) {
        await supabase
          .from('platform_connections')
          .update({
            metadata: {
              ...conn.metadata,
              fb_followers: pageInfo.fan_count || conn.metadata.fb_followers || 0,
            },
          })
          .eq('platform', 'meta');
      }
    } catch (e) {
      console.warn('Could not refresh FB follower count during sync:', e.message);
    }

    res.json({
      synced,
      total: allPosts.length,
      syncType: isIncremental ? 'incremental' : 'full',
      insightsFetched,
      advancedAccess: canFetchInsights,
      message: `Synced ${synced} Facebook posts${canFetchInsights ? ` with ${insightsFetched} insights` : ''}`,
    });
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired. Please reconnect your Meta account.', needsReauth: true });
    }
    console.error('Facebook sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Data Retrieval Endpoints ──────────────────────────────────────────────────

// GET /api/meta/instagram/posts — get stored Instagram posts with insights
router.get('/instagram/posts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
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
    const { count: totalPosts, error: countError } = await supabase
      .from('instagram_insights')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const summary = {
      totalPosts: totalPosts || 0,
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

    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: posts, error } = await supabase
        .from('instagram_insights')
        .select('like_count, comments_count, impressions, reach, saved, shares, engagement, plays, media_type')
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

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

      hasMore = (posts?.length || 0) === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

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
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
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
    const { count: totalPosts, error: countError } = await supabase
      .from('facebook_insights')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    const summary = {
      totalPosts: totalPosts || 0,
      totalImpressions: 0,
      totalReach: 0,
      totalEngagement: 0,
      totalReactions: 0,
      totalComments: 0,
      totalShares: 0,
      totalClicks: 0,
    };

    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: posts, error } = await supabase
        .from('facebook_insights')
        .select('impressions, reach, engagement, reactions_total, comments_count, shares_count, clicks')
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;

      (posts || []).forEach(p => {
        summary.totalImpressions += p.impressions || 0;
        summary.totalReach += p.reach || 0;
        summary.totalEngagement += p.engagement || 0;
        summary.totalReactions += p.reactions_total || 0;
        summary.totalComments += p.comments_count || 0;
        summary.totalShares += p.shares_count || 0;
        summary.totalClicks += p.clicks || 0;
      });

      hasMore = (posts?.length || 0) === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

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

// ─── Data Deletion Callback (required by Meta for App Review) ──────────────────

// POST /api/meta/data-deletion — Meta calls this when a user requests data deletion
router.post('/data-deletion', async (req, res) => {
  try {
    const signedRequest = req.body?.signed_request;
    if (!signedRequest) {
      return res.status(400).json({ error: 'Missing signed_request' });
    }

    const data = parseSignedRequest(signedRequest);
    console.log('Meta data deletion request for user:', data.user_id);

    const result = await handleDataDeletion(data.user_id);

    // Meta expects this exact response format
    const statusUrl = `${process.env.CLIENT_URL || 'https://glowstack.net'}/data-deletion-status?code=${result.confirmationCode}`;
    res.json({
      url: statusUrl,
      confirmation_code: result.confirmationCode,
    });
  } catch (err) {
    console.error('Data deletion error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meta/data-deletion-status — user can check deletion status
router.get('/data-deletion-status', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).json({ error: 'Missing confirmation code' });

  // Check if the deletion was completed
  const { data: conn } = await supabase
    .from('platform_connections')
    .select('metadata')
    .eq('platform', 'meta')
    .single();

  const deletedAt = conn?.metadata?.deleted_at;
  const deletionCode = conn?.metadata?.deletion_code;

  if (deletionCode === code && deletedAt) {
    return res.json({
      status: 'completed',
      deleted_at: deletedAt,
      confirmation_code: code,
    });
  }

  res.json({ status: 'pending', confirmation_code: code });
});

// ─── Webhooks (real-time updates from Meta) ────────────────────────────────────

// GET /api/meta/webhook — Meta webhook verification (challenge-response)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('Meta webhook verified');
    return res.status(200).send(challenge);
  }

  console.warn('Meta webhook verification failed');
  res.status(403).send('Forbidden');
});

// POST /api/meta/webhook — receive webhook events from Meta
router.post('/webhook', async (req, res) => {
  try {
    // Verify signature
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.warn('Meta webhook: invalid signature');
      return res.status(403).send('Invalid signature');
    }

    const { object, entry } = req.body;
    console.log('Meta webhook received:', object, 'entries:', entry?.length);

    // Process webhook events asynchronously
    if (object === 'page') {
      for (const e of (entry || [])) {
        for (const change of (e.changes || [])) {
          await processWebhookChange('facebook', e.id, change);
        }
      }
    } else if (object === 'instagram') {
      for (const e of (entry || [])) {
        for (const change of (e.changes || [])) {
          await processWebhookChange('instagram', e.id, change);
        }
      }
    }

    // Always respond 200 quickly to avoid Meta retries
    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    // Still respond 200 to avoid retries
    res.status(200).send('EVENT_RECEIVED');
  }
});

/** Process a single webhook change event */
async function processWebhookChange(platform, sourceId, change) {
  console.log(`Webhook change [${platform}/${sourceId}]:`, change.field, change.value?.verb || '');

  // For now, log webhook events. Once App Review is complete,
  // we can trigger incremental syncs or real-time updates here.
  if (isSupabaseConfigured()) {
    await supabase.from('meta_sync_log').insert({
      platform,
      sync_type: 'webhook',
      status: 'completed',
      posts_synced: 0,
      error_message: JSON.stringify({ field: change.field, verb: change.value?.verb }),
    });
  }
}

// ─── Privacy & Legal Pages ─────────────────────────────────────────────────────

// GET /api/meta/privacy-policy — serve privacy policy (required by Meta)
router.get('/privacy-policy', (req, res) => {
  // Redirect to the main privacy policy page on the frontend
  res.redirect(`${CLIENT_REDIRECT}/privacy`);
});

// GET /api/meta/terms — serve terms of service
router.get('/terms', (req, res) => {
  res.redirect(`${CLIENT_REDIRECT}/terms`);
});

export default router;
