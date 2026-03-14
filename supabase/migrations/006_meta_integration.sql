-- Meta (Instagram + Facebook) integration tables

-- Store Instagram post insights pulled from Meta Graph API
CREATE TABLE IF NOT EXISTS instagram_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ig_media_id TEXT NOT NULL UNIQUE,        -- Instagram media ID from Graph API
  media_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL, -- link to our media library
  media_type TEXT,                         -- IMAGE, VIDEO, CAROUSEL_ALBUM, REELS
  media_product_type TEXT,                 -- FEED, REELS, STORY
  caption TEXT,
  permalink TEXT,
  timestamp TIMESTAMPTZ,                   -- when the post was published on IG
  like_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  plays INTEGER DEFAULT 0,                 -- for Reels/videos
  thumbnail_url TEXT,
  raw_insights JSONB DEFAULT '{}',         -- full raw insights response for future use
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ig_insights_timestamp ON instagram_insights (timestamp DESC);
CREATE INDEX idx_ig_insights_media_type ON instagram_insights (media_type);
CREATE INDEX idx_ig_insights_synced ON instagram_insights (last_synced_at);

-- Store Facebook Page post insights
CREATE TABLE IF NOT EXISTS facebook_insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fb_post_id TEXT NOT NULL UNIQUE,         -- Facebook post ID from Graph API
  message TEXT,
  permalink_url TEXT,
  post_type TEXT,                          -- link, status, photo, video
  created_time TIMESTAMPTZ,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  reactions_total INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  full_picture TEXT,
  raw_insights JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fb_insights_created_time ON facebook_insights (created_time DESC);
CREATE INDEX idx_fb_insights_synced ON facebook_insights (last_synced_at);

-- Track sync history
CREATE TABLE IF NOT EXISTS meta_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,                  -- 'instagram' or 'facebook'
  sync_type TEXT NOT NULL DEFAULT 'full',  -- 'full' or 'incremental'
  posts_synced INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',  -- running, completed, failed
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
