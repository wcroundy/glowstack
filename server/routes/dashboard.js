import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoDashboardWidgets, demoInsights } from '../services/demoData.js';

const router = Router();

// GET /api/dashboard/widgets
router.get('/widgets', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ data: demoDashboardWidgets });
    }

    const { data, error } = await supabase
      .from('dashboard_widgets')
      .select('*')
      .eq('is_visible', true)
      .order('position_y', { ascending: true })
      .order('position_x', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Dashboard widgets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dashboard/widgets/:id
router.put('/widgets/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const widget = demoDashboardWidgets.find(w => w.id === req.params.id);
      if (!widget) return res.status(404).json({ error: 'Widget not found' });
      Object.assign(widget, req.body);
      return res.json(widget);
    }

    const { data, error } = await supabase
      .from('dashboard_widgets')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Dashboard widget update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/insights
router.get('/insights', async (req, res) => {
  try {
    res.json({ data: demoInsights });
  } catch (err) {
    console.error('Dashboard insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/social-overview — aggregate real data from all connected platforms
router.get('/social-overview', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({
        instagram: null,
        facebook: null,
        tiktok: null,
        totals: { posts: 0, likes: 0, comments: 0, reach: 0, impressions: 0 },
      });
    }

    // Instagram aggregates
    const { count: igCount } = await supabase
      .from('instagram_insights')
      .select('*', { count: 'exact', head: true });

    let igTotals = { posts: igCount || 0, likes: 0, comments: 0, reach: 0, impressions: 0, saves: 0, shares: 0, plays: 0 };
    const IG_PAGE = 1000;
    let igOffset = 0;
    let igMore = true;
    while (igMore) {
      const { data: igRows } = await supabase
        .from('instagram_insights')
        .select('like_count, comments_count, reach, impressions, saved, shares, plays')
        .range(igOffset, igOffset + IG_PAGE - 1);
      (igRows || []).forEach(r => {
        igTotals.likes += r.like_count || 0;
        igTotals.comments += r.comments_count || 0;
        igTotals.reach += r.reach || 0;
        igTotals.impressions += r.impressions || 0;
        igTotals.saves += r.saved || 0;
        igTotals.shares += r.shares || 0;
        igTotals.plays += r.plays || 0;
      });
      igMore = (igRows?.length || 0) === IG_PAGE;
      igOffset += IG_PAGE;
    }

    // Instagram engagement rate: (likes + comments + saves + shares) / posts
    igTotals.engagementRate = igTotals.posts > 0
      ? Math.round(((igTotals.likes + igTotals.comments + igTotals.saves + igTotals.shares) / igTotals.posts) * 10) / 10
      : 0;

    // Instagram recent posts (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: igRecent } = await supabase
      .from('instagram_insights')
      .select('ig_media_id, caption, permalink, timestamp, like_count, comments_count, media_type, thumbnail_url')
      .gte('timestamp', thirtyDaysAgo)
      .order('timestamp', { ascending: false })
      .limit(10);

    // Facebook aggregates
    const { count: fbCount } = await supabase
      .from('facebook_insights')
      .select('*', { count: 'exact', head: true });

    let fbTotals = { posts: fbCount || 0, reactions: 0, comments: 0, shares: 0, reach: 0, impressions: 0, clicks: 0, engagement: 0 };
    let fbOffset = 0;
    let fbMore = true;
    while (fbMore) {
      const { data: fbRows } = await supabase
        .from('facebook_insights')
        .select('reactions_total, comments_count, shares_count, reach, impressions, clicks, engagement')
        .range(fbOffset, fbOffset + IG_PAGE - 1);
      (fbRows || []).forEach(r => {
        fbTotals.reactions += r.reactions_total || 0;
        fbTotals.comments += r.comments_count || 0;
        fbTotals.shares += r.shares_count || 0;
        fbTotals.reach += r.reach || 0;
        fbTotals.impressions += r.impressions || 0;
        fbTotals.clicks += r.clicks || 0;
        fbTotals.engagement += r.engagement || 0;
      });
      fbMore = (fbRows?.length || 0) === IG_PAGE;
      fbOffset += IG_PAGE;
    }

    fbTotals.engagementRate = fbTotals.posts > 0
      ? Math.round(((fbTotals.reactions + fbTotals.comments + fbTotals.shares) / fbTotals.posts) * 10) / 10
      : 0;

    // Facebook recent posts (last 30 days)
    const { data: fbRecent } = await supabase
      .from('facebook_insights')
      .select('fb_post_id, message, permalink_url, created_time, reactions_total, comments_count, shares_count, full_picture')
      .gte('created_time', thirtyDaysAgo)
      .order('created_time', { ascending: false })
      .limit(10);

    // TikTok aggregates (if table exists)
    let tkTotals = null;
    let tkRecent = null;
    try {
      const { count: tkCount } = await supabase
        .from('tiktok_videos')
        .select('*', { count: 'exact', head: true });

      if (tkCount > 0) {
        tkTotals = { posts: tkCount, likes: 0, comments: 0, shares: 0, views: 0 };
        let tkOffset = 0;
        let tkMore = true;
        while (tkMore) {
          const { data: tkRows } = await supabase
            .from('tiktok_videos')
            .select('like_count, comment_count, share_count, view_count')
            .range(tkOffset, tkOffset + IG_PAGE - 1);
          (tkRows || []).forEach(r => {
            tkTotals.likes += r.like_count || 0;
            tkTotals.comments += r.comment_count || 0;
            tkTotals.shares += r.share_count || 0;
            tkTotals.views += r.view_count || 0;
          });
          tkMore = (tkRows?.length || 0) === IG_PAGE;
          tkOffset += IG_PAGE;
        }
        tkTotals.engagementRate = tkTotals.posts > 0
          ? Math.round(((tkTotals.likes + tkTotals.comments + tkTotals.shares) / tkTotals.posts) * 10) / 10
          : 0;
      }
    } catch { /* tiktok table may not exist */ }

    // Connection info
    const { data: metaConn } = await supabase
      .from('platform_connections')
      .select('metadata')
      .eq('platform', 'meta')
      .eq('is_connected', true)
      .single();

    const igFollowers = metaConn?.metadata?.ig_followers || 0;

    res.json({
      instagram: { ...igTotals, followers: igFollowers, recentPosts: igRecent || [] },
      facebook: { ...fbTotals, recentPosts: fbRecent || [] },
      tiktok: tkTotals,
      totals: {
        posts: (igTotals.posts || 0) + (fbTotals.posts || 0) + (tkTotals?.posts || 0),
        likes: (igTotals.likes || 0) + (fbTotals.reactions || 0) + (tkTotals?.likes || 0),
        comments: (igTotals.comments || 0) + (fbTotals.comments || 0) + (tkTotals?.comments || 0),
        reach: (igTotals.reach || 0) + (fbTotals.reach || 0),
        impressions: (igTotals.impressions || 0) + (fbTotals.impressions || 0),
      },
    });
  } catch (err) {
    console.error('Dashboard social-overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
