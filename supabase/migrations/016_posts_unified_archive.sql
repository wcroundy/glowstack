-- ============================================================
-- Post History (Phase 1): make `posts` the unified cross-platform
-- archive that Instagram/Facebook/TikTok syncs write into,
-- alongside the platform-specific insights tables they already use.
-- ============================================================

ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- One row per (platform, platform post id, user) — re-syncing upserts in place.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_platform_post_user_unique;
ALTER TABLE posts ADD CONSTRAINT posts_platform_post_user_unique UNIQUE (platform, platform_post_id, user_id);

CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts (engagement_rate DESC);
