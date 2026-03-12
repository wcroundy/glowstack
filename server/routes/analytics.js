import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoPlatformAnalytics, demoPosts } from '../services/demoData.js';

const router = Router();

// GET /api/analytics/overview
router.get('/overview', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const { platform } = req.query;
      let analytics = [...demoPlatformAnalytics];
      if (platform && platform !== 'all') analytics = analytics.filter(a => a.platform === platform);

      const totalFollowers = ['instagram', 'tiktok', 'youtube', 'pinterest'].reduce((sum, p) => {
        const platData = demoPlatformAnalytics.filter(a => a.platform === p);
        return sum + (platData.length ? platData[platData.length - 1].followers : 0);
      }, 0);

      const weeklyReach = analytics
        .filter(a => new Date(a.date) >= new Date(Date.now() - 7 * 86400000))
        .reduce((sum, a) => sum + a.total_reach, 0);

      const posts = demoPosts.filter(p => p.status === 'published');
      const avgEngagement = posts.reduce((sum, p) => sum + p.engagement_rate, 0) / posts.length;
      const totalRevenue = posts.reduce((sum, p) => sum + (p.revenue || 0), 0);

      return res.json({
        total_followers: totalFollowers,
        weekly_reach: weeklyReach,
        avg_engagement_rate: Math.round(avgEngagement * 10) / 10,
        total_revenue_30d: totalRevenue,
        total_posts_30d: posts.length,
        follower_growth_pct: 4.2,
        reach_growth_pct: 12.8,
      });
    }

    // Supabase: aggregate from platform_analytics and posts
    const { platform } = req.query;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // Get latest follower counts per platform
    let followerQuery = supabase
      .from('platform_analytics')
      .select('platform, followers, date')
      .order('date', { ascending: false });
    if (platform && platform !== 'all') followerQuery = followerQuery.eq('platform', platform);

    const { data: followerData } = await followerQuery;
    const latestByPlatform = {};
    (followerData || []).forEach(r => {
      if (!latestByPlatform[r.platform]) latestByPlatform[r.platform] = r.followers;
    });
    const totalFollowers = Object.values(latestByPlatform).reduce((s, f) => s + f, 0);

    // Weekly reach
    let reachQuery = supabase
      .from('platform_analytics')
      .select('total_reach')
      .gte('date', sevenDaysAgo);
    if (platform && platform !== 'all') reachQuery = reachQuery.eq('platform', platform);
    const { data: reachData } = await reachQuery;
    const weeklyReach = (reachData || []).reduce((s, r) => s + (r.total_reach || 0), 0);

    // Post metrics
    let postQuery = supabase
      .from('posts')
      .select('engagement_rate, revenue')
      .eq('status', 'published')
      .gte('published_at', new Date(Date.now() - 30 * 86400000).toISOString());
    if (platform && platform !== 'all') postQuery = postQuery.eq('platform', platform);
    const { data: postData } = await postQuery;

    const avgEngagement = postData?.length
      ? postData.reduce((s, p) => s + (p.engagement_rate || 0), 0) / postData.length
      : 0;
    const totalRevenue = (postData || []).reduce((s, p) => s + parseFloat(p.revenue || 0), 0);

    res.json({
      total_followers: totalFollowers,
      weekly_reach: weeklyReach,
      avg_engagement_rate: Math.round(avgEngagement * 10) / 10,
      total_revenue_30d: totalRevenue,
      total_posts_30d: postData?.length || 0,
      follower_growth_pct: 0,
      reach_growth_pct: 0,
    });
  } catch (err) {
    console.error('Analytics overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/platform/:platform
router.get('/platform/:platform', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const data = demoPlatformAnalytics.filter(a => a.platform === req.params.platform);
      return res.json({ data });
    }

    const { data, error } = await supabase
      .from('platform_analytics')
      .select('*')
      .eq('platform', req.params.platform)
      .order('date', { ascending: true })
      .limit(90);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Analytics platform error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/posts
router.get('/posts', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const { sort = 'engagement_rate', platform, limit = 20 } = req.query;
      let posts = demoPosts.filter(p => p.status === 'published');
      if (platform && platform !== 'all') posts = posts.filter(p => p.platform === platform);
      posts.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
      return res.json({ data: posts.slice(0, parseInt(limit)) });
    }

    const { sort = 'engagement_rate', platform, limit = 20 } = req.query;
    let query = supabase
      .from('posts')
      .select('*, media_assets(thumbnail_url, title)')
      .eq('status', 'published')
      .order(sort, { ascending: false })
      .limit(parseInt(limit));
    if (platform && platform !== 'all') query = query.eq('platform', platform);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Analytics posts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/best-times
router.get('/best-times', async (req, res) => {
  // For now, return calculated or static best times
  // In production, this would analyze analytics_snapshots for patterns
  res.json({
    instagram: { best_days: ['Tuesday', 'Thursday'], best_hours: [18, 19, 20], timezone: 'EST' },
    tiktok: { best_days: ['Friday', 'Saturday'], best_hours: [19, 20, 21], timezone: 'EST' },
    youtube: { best_days: ['Saturday', 'Sunday'], best_hours: [10, 11, 14], timezone: 'EST' },
    pinterest: { best_days: ['Sunday', 'Monday'], best_hours: [20, 21, 22], timezone: 'EST' },
  });
});

// GET /api/analytics/content-performance
router.get('/content-performance', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const byType = {};
      demoPosts.filter(p => p.status === 'published').forEach(p => {
        const key = `${p.platform}-${p.post_type}`;
        if (!byType[key]) byType[key] = { platform: p.platform, post_type: p.post_type, count: 0, total_reach: 0, total_engagement: 0, total_revenue: 0 };
        byType[key].count++;
        byType[key].total_reach += p.reach;
        byType[key].total_engagement += p.engagement_rate;
        byType[key].total_revenue += p.revenue || 0;
      });
      const data = Object.values(byType).map(item => ({
        ...item,
        avg_engagement: Math.round((item.total_engagement / item.count) * 10) / 10,
        avg_reach: Math.round(item.total_reach / item.count),
      }));
      return res.json({ data });
    }

    const { data: posts, error } = await supabase
      .from('posts')
      .select('platform, post_type, reach, engagement_rate, revenue')
      .eq('status', 'published');
    if (error) throw error;

    const byType = {};
    (posts || []).forEach(p => {
      const key = `${p.platform}-${p.post_type}`;
      if (!byType[key]) byType[key] = { platform: p.platform, post_type: p.post_type, count: 0, total_reach: 0, total_engagement: 0, total_revenue: 0 };
      byType[key].count++;
      byType[key].total_reach += p.reach || 0;
      byType[key].total_engagement += p.engagement_rate || 0;
      byType[key].total_revenue += parseFloat(p.revenue || 0);
    });

    const data = Object.values(byType).map(item => ({
      ...item,
      avg_engagement: Math.round((item.total_engagement / item.count) * 10) / 10,
      avg_reach: Math.round(item.total_reach / item.count),
    }));
    res.json({ data });
  } catch (err) {
    console.error('Analytics content-performance error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
