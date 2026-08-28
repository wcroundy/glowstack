-- ============================================================
-- One-time backfill: copy the historical rows already sitting in
-- instagram_insights/facebook_insights (synced before Post History
-- existed) into the unified posts archive. Going forward, the
-- sync routes keep both in sync; this just catches posts up.
-- ============================================================

INSERT INTO posts (
  platform, platform_post_id, user_id, post_url, post_type, caption, thumbnail_url,
  status, published_at, likes, comments, shares, saves, reach, impressions, views, engagement_rate
)
SELECT
  'instagram', ig_media_id, user_id, permalink,
  lower(coalesce(media_product_type, media_type, 'post')),
  caption, thumbnail_url, 'published', timestamp,
  coalesce(like_count, 0), coalesce(comments_count, 0), coalesce(shares, 0), coalesce(saved, 0),
  coalesce(reach, 0), coalesce(impressions, 0), coalesce(plays, 0),
  CASE WHEN coalesce(reach, 0) > 0
    THEN round((((coalesce(like_count,0) + coalesce(comments_count,0) + coalesce(saved,0) + coalesce(shares,0))::numeric / reach) * 100)::numeric, 2)
    ELSE 0 END
FROM instagram_insights
WHERE user_id IS NOT NULL
ON CONFLICT (platform, platform_post_id, user_id) DO UPDATE SET
  post_url = EXCLUDED.post_url, caption = EXCLUDED.caption, thumbnail_url = EXCLUDED.thumbnail_url,
  published_at = EXCLUDED.published_at, likes = EXCLUDED.likes, comments = EXCLUDED.comments,
  shares = EXCLUDED.shares, saves = EXCLUDED.saves, reach = EXCLUDED.reach,
  impressions = EXCLUDED.impressions, views = EXCLUDED.views, engagement_rate = EXCLUDED.engagement_rate;

INSERT INTO posts (
  platform, platform_post_id, user_id, post_url, post_type, caption, thumbnail_url,
  status, published_at, likes, comments, shares, reach, impressions, clicks, engagement_rate
)
SELECT
  'facebook', fb_post_id, user_id, permalink_url, 'post',
  message, full_picture, 'published', created_time,
  coalesce(reactions_total, 0), coalesce(comments_count, 0), coalesce(shares_count, 0),
  coalesce(reach, 0), coalesce(impressions, 0), coalesce(clicks, 0),
  CASE WHEN coalesce(impressions, 0) > 0
    THEN round(((coalesce(engagement, 0)::numeric / impressions) * 100)::numeric, 2)
    ELSE 0 END
FROM facebook_insights
WHERE user_id IS NOT NULL
ON CONFLICT (platform, platform_post_id, user_id) DO UPDATE SET
  post_url = EXCLUDED.post_url, caption = EXCLUDED.caption, thumbnail_url = EXCLUDED.thumbnail_url,
  published_at = EXCLUDED.published_at, likes = EXCLUDED.likes, comments = EXCLUDED.comments,
  shares = EXCLUDED.shares, reach = EXCLUDED.reach, impressions = EXCLUDED.impressions,
  clicks = EXCLUDED.clicks, engagement_rate = EXCLUDED.engagement_rate;
