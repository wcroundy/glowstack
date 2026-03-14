-- TikTok integration tables

-- Store TikTok video insights
CREATE TABLE IF NOT EXISTS tiktok_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tiktok_video_id TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  cover_image_url TEXT,
  share_url TEXT,
  duration INTEGER DEFAULT 0,            -- video duration in seconds
  create_time TIMESTAMPTZ,               -- when video was posted
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  raw_data JSONB DEFAULT '{}',           -- full raw response for future use
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tiktok_insights_create_time ON tiktok_insights (create_time DESC);
CREATE INDEX idx_tiktok_insights_synced ON tiktok_insights (last_synced_at);
