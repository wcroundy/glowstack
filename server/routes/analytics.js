import { Router } from 'express';
import { demoPlatformAnalytics, demoPosts } from '../services/demoData.js';

const router = Router();

// GET /api/analytics/overview
router.get('/overview', (req, res) => {
  const { period = '30d', platform } = req.query;

  let analytics = [...demoPlatformAnalytics];
  if (platform && platform !== 'all') {
    analytics = analytics.filter(a => a.platform === platform);
  }

  // Aggregate
  const latest = analytics.filter(a => {
    const d = new Date(a.date);
    return d >= new Date(Date.now() - 86400000);
  });

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

  res.json({
    total_followers: totalFollowers,
    weekly_reach: weeklyReach,
    avg_engagement_rate: Math.round(avgEngagement * 10) / 10,
    total_revenue_30d: totalRevenue,
    total_posts_30d: posts.length,
    follower_growth_pct: 4.2,
    reach_growth_pct: 12.8,
  });
});

// GET /api/analytics/platform/:platform
router.get('/platform/:platform', (req, res) => {
  const data = demoPlatformAnalytics.filter(a => a.platform === req.params.platform);
  res.json({ data });
});

// GET /api/analytics/posts — post-level analytics
router.get('/posts', (req, res) => {
  const { sort = 'engagement_rate', platform, limit = 20 } = req.query;
  let posts = demoPosts.filter(p => p.status === 'published');
  if (platform && platform !== 'all') {
    posts = posts.filter(p => p.platform === platform);
  }
  posts.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
  res.json({ data: posts.slice(0, parseInt(limit)) });
});

// GET /api/analytics/best-times
router.get('/best-times', (req, res) => {
  res.json({
    instagram: { best_days: ['Tuesday', 'Thursday'], best_hours: [18, 19, 20], timezone: 'EST' },
    tiktok: { best_days: ['Friday', 'Saturday'], best_hours: [19, 20, 21], timezone: 'EST' },
    youtube: { best_days: ['Saturday', 'Sunday'], best_hours: [10, 11, 14], timezone: 'EST' },
    pinterest: { best_days: ['Sunday', 'Monday'], best_hours: [20, 21, 22], timezone: 'EST' },
  });
});

// GET /api/analytics/content-performance
router.get('/content-performance', (req, res) => {
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

  res.json({ data });
});

export default router;
