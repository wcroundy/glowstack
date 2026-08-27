-- ============================================================
-- AI Providers: per-user assignment of which connected AI
-- provider (stored in platform_connections, e.g. 'openai',
-- 'anthropic') powers the Chat Assistant vs Media Analysis
-- (auto-tagging, video breakdown).
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_settings (
  user_id TEXT PRIMARY KEY DEFAULT 'default',
  chat_provider TEXT,    -- 'openai' | 'anthropic' | NULL
  vision_provider TEXT,  -- 'openai' | 'anthropic' | NULL
  updated_at TIMESTAMPTZ DEFAULT now()
);
