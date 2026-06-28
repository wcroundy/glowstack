-- ============================================================
-- Multi-tenant support: user_id scoping for SaaS
-- ============================================================

-- 1. Create users table for tracking GlowStack accounts
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  password_hash TEXT,  -- bcrypt hash
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Migrate platform_connections unique constraint
--    Old: UNIQUE (platform)  — only 1 connection per platform globally
--    New: UNIQUE (platform, user_id) — 1 connection per platform per user
ALTER TABLE platform_connections DROP CONSTRAINT IF EXISTS platform_connections_platform_unique;

-- Populate existing rows with a default user_id if null
-- (preserves Brooklyn's data during migration)
UPDATE platform_connections SET user_id = 'default' WHERE user_id IS NULL;

-- New constraint: one connection per platform per user
ALTER TABLE platform_connections ADD CONSTRAINT platform_connections_platform_user_unique UNIQUE (platform, user_id);

-- 3. Add user_id to all content tables that need scoping
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE meta_sync_log ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';

-- Backfill existing insights rows
UPDATE instagram_insights SET user_id = 'default' WHERE user_id IS NULL;
UPDATE facebook_insights SET user_id = 'default' WHERE user_id IS NULL;

-- 4. Add indexes for user-scoped queries
CREATE INDEX IF NOT EXISTS idx_media_assets_user ON media_assets (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user ON calendar_events (user_id);
CREATE INDEX IF NOT EXISTS idx_ig_insights_user ON instagram_insights (user_id);
CREATE INDEX IF NOT EXISTS idx_fb_insights_user ON facebook_insights (user_id);
CREATE INDEX IF NOT EXISTS idx_meta_sync_log_user ON meta_sync_log (user_id);

-- 5. Add unique constraint for insights per user
--    Drop old unique constraint and add user-scoped one
ALTER TABLE instagram_insights DROP CONSTRAINT IF EXISTS instagram_insights_ig_media_id_key;
ALTER TABLE instagram_insights ADD CONSTRAINT ig_insights_media_user_unique UNIQUE (ig_media_id, user_id);

ALTER TABLE facebook_insights DROP CONSTRAINT IF EXISTS facebook_insights_fb_post_id_key;
ALTER TABLE facebook_insights ADD CONSTRAINT fb_insights_post_user_unique UNIQUE (fb_post_id, user_id);
