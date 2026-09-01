-- ============================================================
-- Trending: track specific hashtags via Instagram's Hashtag
-- Search API and pull the algorithmically top-performing public
-- posts under each — a read on what's landing platform-wide,
-- not just for accounts you follow.
-- ============================================================

CREATE TABLE IF NOT EXISTS watched_hashtags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT DEFAULT 'default',
  platform TEXT NOT NULL DEFAULT 'instagram',
  hashtag TEXT NOT NULL,           -- without the #
  hashtag_id TEXT,                 -- Meta's internal ID, cached to avoid re-resolving
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, hashtag, user_id)
);

CREATE TABLE IF NOT EXISTS hashtag_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watched_hashtag_id UUID REFERENCES watched_hashtags(id) ON DELETE CASCADE,
  platform_post_id TEXT NOT NULL,
  post_url TEXT,
  caption TEXT,
  media_type TEXT,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (watched_hashtag_id, platform_post_id)
);

CREATE INDEX IF NOT EXISTS idx_watched_hashtags_user ON watched_hashtags (user_id);
CREATE INDEX IF NOT EXISTS idx_hashtag_posts_hashtag ON hashtag_posts (watched_hashtag_id);
CREATE INDEX IF NOT EXISTS idx_hashtag_posts_engagement ON hashtag_posts ((likes + comments) DESC);
