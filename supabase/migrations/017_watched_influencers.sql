-- ============================================================
-- Watchlist: track other Instagram creators (via Meta's
-- Business Discovery API — no permission needed from them,
-- as long as they're a Business/Creator account) so their
-- recent posts and engagement can be compared alongside ours.
-- ============================================================

CREATE TABLE IF NOT EXISTS watched_influencers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT DEFAULT 'default',
  platform TEXT NOT NULL DEFAULT 'instagram',
  username TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  profile_picture_url TEXT,
  followers_count INT,
  follows_count INT,
  media_count INT,
  notes TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (platform, username, user_id)
);

CREATE TABLE IF NOT EXISTS watched_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  watched_influencer_id UUID REFERENCES watched_influencers(id) ON DELETE CASCADE,
  platform_post_id TEXT NOT NULL,
  post_url TEXT,
  caption TEXT,
  media_type TEXT,
  thumbnail_url TEXT,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  published_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (watched_influencer_id, platform_post_id)
);

CREATE INDEX IF NOT EXISTS idx_watched_influencers_user ON watched_influencers (user_id);
CREATE INDEX IF NOT EXISTS idx_watched_posts_influencer ON watched_posts (watched_influencer_id);
CREATE INDEX IF NOT EXISTS idx_watched_posts_engagement ON watched_posts ((likes + comments) DESC);
