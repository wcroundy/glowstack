// ============================================================
// Demo data for the prototype — replaces real DB when Supabase
// is not yet configured.  All IDs are stable UUIDs so the
// front-end can link between entities.
// ============================================================

import { v4 as uuid } from 'uuid';

const platformIcons = {
  instagram: '📸', tiktok: '🎵', youtube: '🎬', pinterest: '📌',
  facebook: '👤', shopmy: '🛍️', ltk: '❤️', walmart: '🏪', amazon: '📦',
};

// ── Platform Connections ──────────────────────────────────────
export const demoPlatforms = [
  { id: 'p1', platform: 'instagram',    display_name: 'Instagram',     is_connected: true,  account_username: '@glambycolby', followers: 248000 },
  { id: 'p2', platform: 'tiktok',       display_name: 'TikTok',        is_connected: true,  account_username: '@glambycolby', followers: 512000 },
  { id: 'p3', platform: 'youtube',      display_name: 'YouTube',       is_connected: true,  account_username: 'Glam by Colby', followers: 89000  },
  { id: 'p4', platform: 'pinterest',    display_name: 'Pinterest',     is_connected: true,  account_username: '@glambycolby', followers: 67000  },
  { id: 'p5', platform: 'facebook',     display_name: 'Facebook',      is_connected: false, account_username: null },
  { id: 'p6', platform: 'shopmy',       display_name: 'ShopMy',        is_connected: true,  account_username: 'glambycolby' },
  { id: 'p7', platform: 'ltk',          display_name: 'LTK',           is_connected: true,  account_username: 'glambycolby' },
  { id: 'p8', platform: 'walmart',      display_name: 'Walmart Creator', is_connected: false },
  { id: 'p9', platform: 'amazon',       display_name: 'Amazon Influencer', is_connected: true, account_username: 'glambycolby' },
  { id: 'p10', platform: 'google_photos', display_name: 'Google Photos', is_connected: true },
];

// ── Tags ──────────────────────────────────────────────────────
export const demoTags = [
  { id: 't1',  name: 'GRWM',       color: '#f472b6', category: 'content_type' },
  { id: 't2',  name: 'Tutorial',   color: '#a78bfa', category: 'content_type' },
  { id: 't3',  name: 'Haul',       color: '#fb923c', category: 'content_type' },
  { id: 't4',  name: 'Review',     color: '#34d399', category: 'content_type' },
  { id: 't5',  name: 'OOTD',       color: '#f472b6', category: 'content_type' },
  { id: 't6',  name: 'Skincare',   color: '#67e8f9', category: 'product' },
  { id: 't7',  name: 'Makeup',     color: '#f9a8d4', category: 'product' },
  { id: 't8',  name: 'Fashion',    color: '#fb923c', category: 'product' },
  { id: 't9',  name: 'Haircare',   color: '#a78bfa', category: 'product' },
  { id: 't10', name: 'Nails',      color: '#f472b6', category: 'product' },
  { id: 't11', name: 'Spring',     color: '#86efac', category: 'season' },
  { id: 't12', name: 'Summer',     color: '#fde047', category: 'season' },
  { id: 't13', name: 'Winter',     color: '#93c5fd', category: 'season' },
  { id: 't14', name: 'Sponsored',  color: '#fbbf24', category: 'campaign' },
  { id: 't15', name: 'Gifted',     color: '#a78bfa', category: 'campaign' },
  { id: 't16', name: 'Affiliate',  color: '#34d399', category: 'campaign' },
  { id: 't17', name: 'Glam',       color: '#f472b6', category: 'mood' },
  { id: 't18', name: 'Natural',    color: '#86efac', category: 'mood' },
  { id: 't19', name: 'Trending',   color: '#f59e0b', category: 'status' },
  { id: 't20', name: 'Top Performer', color: '#eab308', category: 'status' },
];

// ── Media Assets ──────────────────────────────────────────────
const colors = ['#fce7f3','#e0e7ff','#d1fae5','#fef3c7','#fee2e2','#f3e8ff'];
function placeholder(w, h, label, bg) {
  return `https://placehold.co/${w}x${h}/${bg.replace('#','')}/333?text=${encodeURIComponent(label)}`;
}

export const demoMedia = [
  {
    id: 'm1', source: 'google_photos', file_name: 'summer-glam-look.jpg',
    file_url: placeholder(800, 800, 'Summer Glam', 'fce7f3'),
    thumbnail_url: placeholder(300, 300, 'Summer Glam', 'fce7f3'),
    file_type: 'image', title: 'Summer Glam Look — Golden Hour',
    ai_description: 'Warm-toned summer makeup look with golden eyeshadow and dewy skin, outdoor golden hour lighting',
    ai_tags: ['makeup', 'summer', 'glam', 'golden hour', 'dewy skin'],
    ai_quality_score: 0.94,
    ai_caption_suggestions: [
      'Golden hour, golden glow ✨ Full product list below!',
      'This summer glam is giving everything 🌅',
      'POV: you mastered the dewy look 💫',
    ],
    tags: ['t7', 't12', 't17', 't20'],
    is_favorite: true, captured_at: '2025-07-15T18:30:00Z', created_at: '2025-07-15T19:00:00Z',
  },
  {
    id: 'm2', source: 'upload', file_name: 'skincare-routine-flatlay.jpg',
    file_url: placeholder(800, 800, 'Skincare Flatlay', 'd1fae5'),
    thumbnail_url: placeholder(300, 300, 'Skincare Flatlay', 'd1fae5'),
    file_type: 'image', title: 'Morning Skincare Routine — Flatlay',
    ai_description: 'Organized flatlay of skincare products on marble surface with soft natural lighting',
    ai_tags: ['skincare', 'flatlay', 'routine', 'minimal', 'clean'],
    ai_quality_score: 0.91,
    ai_caption_suggestions: [
      'My holy grail morning lineup 🧴✨',
      'Skincare is self-care 💆‍♀️ Current AM routine',
    ],
    tags: ['t6', 't18', 't4'],
    is_favorite: false, captured_at: '2025-08-02T09:00:00Z', created_at: '2025-08-02T10:00:00Z',
  },
  {
    id: 'm3', source: 'google_photos', file_name: 'fall-ootd-park.jpg',
    file_url: placeholder(800, 1000, 'Fall OOTD', 'fef3c7'),
    thumbnail_url: placeholder(300, 375, 'Fall OOTD', 'fef3c7'),
    file_type: 'image', title: 'Fall OOTD — Central Park',
    ai_description: 'Full-body outfit shot in autumn park, layered knit and wide-leg pants',
    ai_tags: ['fashion', 'fall', 'ootd', 'knitwear', 'street style'],
    ai_quality_score: 0.89,
    ai_caption_suggestions: [
      'Fall layers are my love language 🍂',
      'Sweater weather is better weather 🧣',
    ],
    tags: ['t5', 't8'],
    is_favorite: true, captured_at: '2025-10-10T14:00:00Z', created_at: '2025-10-10T15:00:00Z',
  },
  {
    id: 'm4', source: 'upload', file_name: 'grwm-reel-thumbnail.jpg',
    file_url: placeholder(800, 800, 'GRWM Reel', 'e0e7ff'),
    thumbnail_url: placeholder(300, 300, 'GRWM Reel', 'e0e7ff'),
    file_type: 'video', title: 'GRWM — Date Night',
    ai_description: 'Get ready with me video, date night glam transformation with bold lip and soft smokey eye',
    ai_tags: ['grwm', 'date night', 'makeup', 'transformation', 'glam'],
    ai_quality_score: 0.96,
    duration_seconds: 62,
    tags: ['t1', 't7', 't17', 't14', 't19'],
    is_favorite: true, captured_at: '2025-11-20T17:00:00Z', created_at: '2025-11-20T18:00:00Z',
  },
  {
    id: 'm5', source: 'instagram', file_name: 'nail-art-closeup.jpg',
    file_url: placeholder(800, 800, 'Nail Art', 'f3e8ff'),
    thumbnail_url: placeholder(300, 300, 'Nail Art', 'f3e8ff'),
    file_type: 'image', title: 'Chrome French Tips — Nail Art',
    ai_description: 'Close-up of chrome French tip manicure with subtle shimmer on almond-shaped nails',
    ai_tags: ['nails', 'nail art', 'chrome', 'french tips', 'minimal'],
    ai_quality_score: 0.87,
    tags: ['t10', 't19'],
    is_favorite: false, captured_at: '2025-12-01T12:00:00Z', created_at: '2025-12-01T13:00:00Z',
  },
  {
    id: 'm6', source: 'google_photos', file_name: 'haul-sephora-winter.jpg',
    file_url: placeholder(800, 800, 'Sephora Haul', 'fee2e2'),
    thumbnail_url: placeholder(300, 300, 'Sephora Haul', 'fee2e2'),
    file_type: 'image', title: 'Sephora Winter Haul',
    ai_description: 'Collection of Sephora beauty products spread on white bedding, winter holiday packaging',
    ai_tags: ['haul', 'sephora', 'winter', 'holiday', 'makeup'],
    ai_quality_score: 0.88,
    tags: ['t3', 't7', 't13', 't16'],
    is_favorite: false, captured_at: '2025-12-15T10:00:00Z', created_at: '2025-12-15T11:00:00Z',
  },
  {
    id: 'm7', source: 'upload', file_name: 'tutorial-smokey-eye.jpg',
    file_url: placeholder(800, 450, 'Smokey Eye Tutorial', 'fce7f3'),
    thumbnail_url: placeholder(300, 169, 'Smokey Eye Tutorial', 'fce7f3'),
    file_type: 'video', title: 'Smokey Eye Tutorial — Step by Step',
    ai_description: 'Step-by-step smokey eye makeup tutorial with blending technique close-ups',
    ai_tags: ['tutorial', 'smokey eye', 'makeup', 'technique', 'blending'],
    ai_quality_score: 0.93,
    duration_seconds: 185,
    tags: ['t2', 't7', 't17'],
    is_favorite: true, captured_at: '2026-01-05T14:00:00Z', created_at: '2026-01-05T15:00:00Z',
  },
  {
    id: 'm8', source: 'google_photos', file_name: 'haircare-routine.jpg',
    file_url: placeholder(800, 800, 'Haircare Routine', 'e0e7ff'),
    thumbnail_url: placeholder(300, 300, 'Haircare Routine', 'e0e7ff'),
    file_type: 'image', title: 'Wash Day Routine — Curly Hair',
    ai_description: 'Curly hair wash day products and results, before and after transformation',
    ai_tags: ['haircare', 'curly hair', 'wash day', 'routine', 'transformation'],
    ai_quality_score: 0.85,
    tags: ['t9', 't4'],
    is_favorite: false, captured_at: '2026-01-20T11:00:00Z', created_at: '2026-01-20T12:00:00Z',
  },
];

// ── Posts ──────────────────────────────────────────────────────
const now = new Date();
function daysAgo(n) { return new Date(now - n * 86400000).toISOString(); }

export const demoPosts = [
  {
    id: 'post1', platform: 'instagram', post_type: 'reel', status: 'published',
    caption: 'Golden hour glam ✨ Full product list in bio! #makeup #summermakeup #glam',
    media_asset_id: 'm1', published_at: daysAgo(2),
    likes: 18420, comments: 342, shares: 1230, saves: 2890, reach: 285000, impressions: 412000,
    engagement_rate: 9.2, views: 385000, clicks: 4200,
    hashtags: ['makeup', 'summermakeup', 'glam', 'goldenhour', 'beautytips'],
  },
  {
    id: 'post2', platform: 'tiktok', post_type: 'video', status: 'published',
    caption: 'GRWM for date night 💋 this lip combo is EVERYTHING #grwm #datenight #makeup',
    media_asset_id: 'm4', published_at: daysAgo(4),
    likes: 45200, comments: 1820, shares: 8900, saves: 5200, reach: 1200000, impressions: 1850000,
    engagement_rate: 12.1, views: 1650000, clicks: 8400,
    affiliate_platform: 'shopmy', revenue: 1240.50, conversions: 89,
  },
  {
    id: 'post3', platform: 'youtube', post_type: 'video', status: 'published',
    caption: 'Smokey Eye Tutorial — 5 minute technique that WORKS',
    media_asset_id: 'm7', published_at: daysAgo(7),
    likes: 4200, comments: 580, shares: 320, saves: 1100, reach: 68000, impressions: 92000,
    engagement_rate: 7.8, views: 72000, clicks: 3100,
    affiliate_platform: 'amazon', revenue: 890.25, conversions: 62,
  },
  {
    id: 'post4', platform: 'pinterest', post_type: 'pin', status: 'published',
    caption: 'Fall OOTD Inspiration — Cozy Knitwear Styling',
    media_asset_id: 'm3', published_at: daysAgo(10),
    likes: 2800, comments: 45, shares: 4500, saves: 8900, reach: 125000, impressions: 180000,
    engagement_rate: 6.4, views: 0, clicks: 6200,
    affiliate_platform: 'ltk', revenue: 2100.00, conversions: 145,
  },
  {
    id: 'post5', platform: 'instagram', post_type: 'carousel', status: 'published',
    caption: 'Sephora winter haul! Everything I picked up during the sale 🛍️',
    media_asset_id: 'm6', published_at: daysAgo(14),
    likes: 12800, comments: 890, shares: 2100, saves: 4300, reach: 198000, impressions: 290000,
    engagement_rate: 8.1, views: 0, clicks: 5600,
    affiliate_platform: 'shopmy', revenue: 3200.75, conversions: 210,
  },
  {
    id: 'post6', platform: 'tiktok', post_type: 'video', status: 'published',
    caption: 'My morning skincare routine — simple but effective 🧴 #skincare #routine',
    media_asset_id: 'm2', published_at: daysAgo(18),
    likes: 32100, comments: 1200, shares: 5600, saves: 3800, reach: 890000, impressions: 1200000,
    engagement_rate: 10.5, views: 1100000, clicks: 4800,
  },
  {
    id: 'post7', platform: 'instagram', post_type: 'story', status: 'published',
    caption: 'Chrome French tips 💅 Link to nail tech in bio',
    media_asset_id: 'm5', published_at: daysAgo(21),
    likes: 0, comments: 0, shares: 450, saves: 0, reach: 42000, impressions: 48000,
    engagement_rate: 3.2, views: 42000, clicks: 1200,
  },
  {
    id: 'post8', platform: 'instagram', post_type: 'reel', status: 'scheduled',
    caption: 'Wash day routine for my curly girlies 🧖‍♀️ #haircare #curlyhair',
    media_asset_id: 'm8', scheduled_for: new Date(now.getTime() + 2 * 86400000).toISOString(),
    likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0,
    engagement_rate: 0, views: 0, clicks: 0,
  },
];

// ── Platform Analytics (30 days) ──────────────────────────────
function generatePlatformAnalytics(platform, baseFollowers, dailyGrowth) {
  const data = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const noise = Math.random() * 0.3 - 0.15;
    const followers = Math.round(baseFollowers + (30 - i) * dailyGrowth * (1 + noise));
    data.push({
      platform,
      date: d.toISOString().slice(0, 10),
      followers,
      new_followers: Math.round(dailyGrowth * (1 + noise)),
      total_reach: Math.round((50000 + Math.random() * 40000) * (platform === 'tiktok' ? 3 : 1)),
      total_impressions: Math.round((80000 + Math.random() * 60000) * (platform === 'tiktok' ? 3 : 1)),
      profile_views: Math.round(2000 + Math.random() * 3000),
      website_clicks: Math.round(300 + Math.random() * 700),
    });
  }
  return data;
}

export const demoPlatformAnalytics = [
  ...generatePlatformAnalytics('instagram', 245000, 100),
  ...generatePlatformAnalytics('tiktok', 500000, 400),
  ...generatePlatformAnalytics('youtube', 87000, 65),
  ...generatePlatformAnalytics('pinterest', 65000, 50),
];

// ── Calendar Events ───────────────────────────────────────────
export const demoCalendarEvents = [
  {
    id: 'cal1', title: 'Post: Wash Day Routine Reel', event_type: 'post', platform: 'instagram',
    start_at: new Date(now.getTime() + 2 * 86400000).toISOString(),
    status: 'confirmed', color: '#E1306C', media_asset_id: 'm8',
  },
  {
    id: 'cal2', title: 'Film: Spring Makeup Collection', event_type: 'shoot', platform: null,
    start_at: new Date(now.getTime() + 4 * 86400000).toISOString(),
    end_at: new Date(now.getTime() + 4 * 86400000 + 3 * 3600000).toISOString(),
    status: 'planned', color: '#a78bfa',
  },
  {
    id: 'cal3', title: 'TikTok: Spring Transition GRWM', event_type: 'post', platform: 'tiktok',
    start_at: new Date(now.getTime() + 5 * 86400000).toISOString(),
    status: 'planned', color: '#000000', ai_suggested: true, ai_reason: 'Trending audio + your audience peaks at 7PM EST on Fridays',
  },
  {
    id: 'cal4', title: 'Brand Collab Deadline — Glossier', event_type: 'deadline',
    start_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
    status: 'confirmed', color: '#ef4444',
  },
  {
    id: 'cal5', title: 'YouTube: Full Skincare Routine', event_type: 'post', platform: 'youtube',
    start_at: new Date(now.getTime() + 9 * 86400000).toISOString(),
    status: 'planned', color: '#FF0000', ai_suggested: true, ai_reason: 'Skincare content has 2.3x higher retention on your channel',
  },
  {
    id: 'cal6', title: 'Pinterest: Spring OOTD Board Update', event_type: 'post', platform: 'pinterest',
    start_at: new Date(now.getTime() + 3 * 86400000).toISOString(),
    status: 'planned', color: '#E60023',
  },
];

// ── Dashboard Widgets ─────────────────────────────────────────
export const demoDashboardWidgets = [
  { id: 'w1', widget_type: 'metric_card', title: 'Total Followers', config: { metric: 'followers', value: 916000, change: 4.2, period: 'vs last month' } },
  { id: 'w2', widget_type: 'metric_card', title: 'Weekly Reach', config: { metric: 'reach', value: 2840000, change: 12.8, period: 'vs last week' } },
  { id: 'w3', widget_type: 'metric_card', title: 'Avg Engagement', config: { metric: 'engagement_rate', value: 8.6, change: 1.3, period: 'vs last week', suffix: '%' } },
  { id: 'w4', widget_type: 'metric_card', title: 'Revenue (30d)', config: { metric: 'revenue', value: 7431.50, change: 22.5, period: 'vs last month', prefix: '$' } },
  { id: 'w5', widget_type: 'chart', title: 'Follower Growth', config: { chart_type: 'line' } },
  { id: 'w6', widget_type: 'chart', title: 'Engagement by Platform', config: { chart_type: 'bar' } },
  { id: 'w7', widget_type: 'recent_posts', title: 'Recent Posts', config: { limit: 5 } },
  { id: 'w8', widget_type: 'top_content', title: 'Top Performing', config: { limit: 5, metric: 'engagement_rate' } },
  { id: 'w9', widget_type: 'ai_insights', title: 'AI Insights', config: {} },
];

// ── AI Insights ───────────────────────────────────────────────
export const demoInsights = [
  {
    id: 'ins1', type: 'opportunity', priority: 'high',
    title: 'TikTok GRWM content is outperforming by 3.2x',
    description: 'Your GRWM videos on TikTok average 1.2M views vs 375K for other content types. Consider increasing GRWM frequency from 2x to 3x per week.',
    action: 'Schedule a GRWM post',
  },
  {
    id: 'ins2', type: 'timing', priority: 'medium',
    title: 'Optimal posting window identified',
    description: 'Your audience engagement peaks Tuesday & Thursday 6-8PM EST on Instagram, and Friday 7-9PM EST on TikTok. 3 of your last 5 posts were outside these windows.',
    action: 'Adjust schedule',
  },
  {
    id: 'ins3', type: 'revenue', priority: 'high',
    title: 'Pinterest driving highest affiliate revenue per impression',
    description: 'Pinterest pins generate $0.012/impression via LTK vs $0.004 on Instagram. Your OOTD content converts 3.5x better on Pinterest.',
    action: 'Create more Pinterest content',
  },
  {
    id: 'ins4', type: 'trend', priority: 'medium',
    title: '"Clean girl" aesthetic trending in your niche',
    description: 'The #cleangirl hashtag saw 180% growth this week. Your "Natural" tagged content historically performs well — this is a great fit.',
    action: 'Plan clean girl content',
  },
  {
    id: 'ins5', type: 'content', priority: 'low',
    title: '12 unused high-quality assets in your library',
    description: 'AI analysis found 12 media assets with quality scores above 0.85 that haven\'t been posted yet. Consider featuring them in upcoming content.',
    action: 'View unused assets',
  },
];
