-- ============================================================
-- GlowStack — Full Database Schema
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for fuzzy text search

-- ============================================================
-- Platform Connections (API integrations)
-- ============================================================
CREATE TABLE platform_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL,  -- instagram, tiktok, youtube, pinterest, facebook, shopmy, ltk, walmart, amazon, google_photos
  display_name TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_id TEXT,          -- platform-specific account/channel ID
  account_username TEXT,
  account_avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Tags
-- ============================================================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#ec4899',  -- brand pink default
  category TEXT,  -- content_type, product, brand, season, mood, campaign, etc.
  is_ai_generated BOOLEAN DEFAULT false,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tags_name ON tags USING gin (name gin_trgm_ops);
CREATE INDEX idx_tags_category ON tags (category);

-- ============================================================
-- Media Assets
-- ============================================================
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Source info
  source TEXT NOT NULL DEFAULT 'upload',  -- google_photos, upload, instagram, tiktok, etc.
  source_id TEXT,                          -- ID from originating platform
  source_url TEXT,                         -- Original URL on platform

  -- File info
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,                  -- Supabase storage URL
  thumbnail_url TEXT,
  file_type TEXT NOT NULL,                 -- image, video, carousel
  mime_type TEXT,
  file_size_bytes BIGINT,
  width INT,
  height INT,
  duration_seconds FLOAT,                  -- for videos

  -- AI-generated metadata
  ai_description TEXT,
  ai_tags TEXT[],
  ai_dominant_colors TEXT[],
  ai_detected_products TEXT[],
  ai_detected_brands TEXT[],
  ai_quality_score FLOAT,                  -- 0-1 quality assessment
  ai_caption_suggestions TEXT[],

  -- Organization
  title TEXT,
  notes TEXT,
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  album TEXT,

  -- Timestamps
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_media_source ON media_assets (source, source_id);
CREATE INDEX idx_media_file_type ON media_assets (file_type);
CREATE INDEX idx_media_created ON media_assets (created_at DESC);
CREATE INDEX idx_media_ai_tags ON media_assets USING gin (ai_tags);
CREATE INDEX idx_media_search ON media_assets USING gin (
  (coalesce(title, '') || ' ' || coalesce(ai_description, '') || ' ' || coalesce(notes, '')) gin_trgm_ops
);

-- ============================================================
-- Media-Tag junction
-- ============================================================
CREATE TABLE media_tags (
  media_id UUID REFERENCES media_assets(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  is_ai_assigned BOOLEAN DEFAULT false,
  confidence FLOAT,  -- AI confidence 0-1
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (media_id, tag_id)
);

-- ============================================================
-- Posts (published or scheduled content)
-- ============================================================
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Platform info
  platform TEXT NOT NULL,
  platform_post_id TEXT,
  post_url TEXT,
  post_type TEXT,  -- feed, story, reel, short, pin, video, etc.

  -- Content
  caption TEXT,
  hashtags TEXT[],
  media_asset_id UUID REFERENCES media_assets(id),

  -- Status
  status TEXT DEFAULT 'published',  -- published, scheduled, draft, failed
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,

  -- Engagement snapshot (latest)
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  saves INT DEFAULT 0,
  reach INT DEFAULT 0,
  impressions INT DEFAULT 0,
  engagement_rate FLOAT DEFAULT 0,
  views INT DEFAULT 0,
  clicks INT DEFAULT 0,

  -- Revenue / affiliate
  affiliate_platform TEXT,  -- shopmy, ltk, walmart, amazon
  affiliate_link TEXT,
  revenue DECIMAL(10,2) DEFAULT 0,
  conversions INT DEFAULT 0,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_posts_platform ON posts (platform, status);
CREATE INDEX idx_posts_published ON posts (published_at DESC);
CREATE INDEX idx_posts_scheduled ON posts (scheduled_for) WHERE status = 'scheduled';

-- ============================================================
-- Analytics Snapshots (time-series data)
-- ============================================================
CREATE TABLE analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,

  -- Metrics at snapshot time
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  saves INT DEFAULT 0,
  reach INT DEFAULT 0,
  impressions INT DEFAULT 0,
  views INT DEFAULT 0,
  clicks INT DEFAULT 0,
  engagement_rate FLOAT DEFAULT 0,

  -- Audience demographics at snapshot time
  audience_data JSONB DEFAULT '{}',

  snapshot_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_analytics_post ON analytics_snapshots (post_id, snapshot_at DESC);
CREATE INDEX idx_analytics_platform ON analytics_snapshots (platform, snapshot_at DESC);

-- ============================================================
-- Platform-level Analytics (account-wide metrics)
-- ============================================================
CREATE TABLE platform_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL,
  date DATE NOT NULL,

  followers INT DEFAULT 0,
  following INT DEFAULT 0,
  total_reach INT DEFAULT 0,
  total_impressions INT DEFAULT 0,
  profile_views INT DEFAULT 0,
  website_clicks INT DEFAULT 0,
  new_followers INT DEFAULT 0,
  lost_followers INT DEFAULT 0,

  -- Audience breakdown
  audience_gender JSONB DEFAULT '{}',
  audience_age JSONB DEFAULT '{}',
  audience_location JSONB DEFAULT '{}',
  audience_active_hours JSONB DEFAULT '{}',

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (platform, date)
);

CREATE INDEX idx_platform_analytics ON platform_analytics (platform, date DESC);

-- ============================================================
-- Content Calendar
-- ============================================================
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'post',  -- post, story, reel, collab, shoot, deadline, reminder
  platform TEXT,

  -- Scheduling
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,

  -- Links
  media_asset_id UUID REFERENCES media_assets(id),
  post_id UUID REFERENCES posts(id),

  -- AI suggestions
  ai_suggested BOOLEAN DEFAULT false,
  ai_reason TEXT,

  -- Status
  status TEXT DEFAULT 'planned',  -- planned, confirmed, in_progress, completed, cancelled
  color TEXT DEFAULT '#ec4899',

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendar_date ON calendar_events (start_at, end_at);
CREATE INDEX idx_calendar_status ON calendar_events (status);

-- ============================================================
-- Chat Messages (AI assistant conversation)
-- ============================================================
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role TEXT NOT NULL,  -- user, assistant, system
  content TEXT NOT NULL,

  -- AI context
  tool_calls JSONB,     -- function calls made
  tool_results JSONB,   -- results from function calls
  context JSONB,        -- additional context used

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_created ON chat_messages (created_at DESC);

-- ============================================================
-- Dashboard Configurations
-- ============================================================
CREATE TABLE dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  widget_type TEXT NOT NULL,  -- metric_card, chart, recent_posts, top_content, calendar_preview, ai_insights
  title TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  width INT DEFAULT 1,
  height INT DEFAULT 1,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- AI Reports
-- ============================================================
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,  -- weekly, monthly, campaign, custom
  date_from DATE,
  date_to DATE,
  platforms TEXT[],
  content TEXT,           -- markdown report content
  data JSONB DEFAULT '{}',  -- structured report data
  status TEXT DEFAULT 'generating',  -- generating, ready, failed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Seed default tags
-- ============================================================
INSERT INTO tags (name, color, category) VALUES
  ('GRWM', '#f472b6', 'content_type'),
  ('Tutorial', '#a78bfa', 'content_type'),
  ('Haul', '#fb923c', 'content_type'),
  ('Review', '#34d399', 'content_type'),
  ('OOTD', '#f472b6', 'content_type'),
  ('Skincare', '#67e8f9', 'product'),
  ('Makeup', '#f9a8d4', 'product'),
  ('Haircare', '#a78bfa', 'product'),
  ('Fashion', '#fb923c', 'product'),
  ('Nails', '#f472b6', 'product'),
  ('Fragrance', '#c084fc', 'product'),
  ('Wellness', '#34d399', 'product'),
  ('Spring', '#86efac', 'season'),
  ('Summer', '#fde047', 'season'),
  ('Fall', '#fb923c', 'season'),
  ('Winter', '#93c5fd', 'season'),
  ('Holiday', '#f87171', 'season'),
  ('Sponsored', '#fbbf24', 'campaign'),
  ('Gifted', '#a78bfa', 'campaign'),
  ('Affiliate', '#34d399', 'campaign'),
  ('Collab', '#f472b6', 'campaign'),
  ('Minimal', '#94a3b8', 'mood'),
  ('Glam', '#f472b6', 'mood'),
  ('Natural', '#86efac', 'mood'),
  ('Bold', '#ef4444', 'mood'),
  ('Trending', '#f59e0b', 'status'),
  ('Evergreen', '#22c55e', 'status'),
  ('Top Performer', '#eab308', 'status');

-- ============================================================
-- Seed default dashboard widgets
-- ============================================================
INSERT INTO dashboard_widgets (widget_type, title, config, position_x, position_y, width, height) VALUES
  ('metric_card', 'Total Followers', '{"metric": "followers", "platforms": ["all"]}', 0, 0, 1, 1),
  ('metric_card', 'This Week Reach', '{"metric": "reach", "period": "week"}', 1, 0, 1, 1),
  ('metric_card', 'Engagement Rate', '{"metric": "engagement_rate", "period": "week"}', 2, 0, 1, 1),
  ('metric_card', 'Revenue (30d)', '{"metric": "revenue", "period": "month"}', 3, 0, 1, 1),
  ('chart', 'Follower Growth', '{"chart_type": "line", "metric": "followers", "period": "30d"}', 0, 1, 2, 2),
  ('chart', 'Engagement by Platform', '{"chart_type": "bar", "metric": "engagement", "group_by": "platform"}', 2, 1, 2, 2),
  ('recent_posts', 'Recent Posts', '{"limit": 5}', 0, 3, 2, 2),
  ('top_content', 'Top Performing', '{"metric": "engagement_rate", "limit": 5, "period": "30d"}', 2, 3, 2, 2),
  ('ai_insights', 'AI Insights', '{"auto_refresh": true}', 0, 5, 4, 1);
