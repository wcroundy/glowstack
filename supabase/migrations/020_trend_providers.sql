-- Server-only API keys, configuration and bounded external evidence snapshots.
CREATE TABLE IF NOT EXISTS trend_provider_state (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('socialcrawl', 'trendsapi')),
  api_key TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  snapshot JSONB,
  attempted_at TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY (user_id, provider)
);
ALTER TABLE trend_provider_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trend_provider_state FROM anon, authenticated;
GRANT ALL ON trend_provider_state TO service_role;
