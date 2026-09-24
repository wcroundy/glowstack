-- Private worker pairing and short-lived inference jobs. Never expose to browser DB clients.
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS chat_transport TEXT NOT NULL DEFAULT 'api' CHECK (chat_transport IN ('api','mcp'));
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS vision_transport TEXT NOT NULL DEFAULT 'api' CHECK (vision_transport IN ('api','mcp'));
CREATE TABLE IF NOT EXISTS ai_bridge_connections (
  user_id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  last_seen TIMESTAMPTZ,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_bridge_jobs (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','expired')),
  payload JSONB,
  result JSONB,
  claim_token UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_bridge_jobs_pending ON ai_bridge_jobs(user_id, status, created_at);
ALTER TABLE ai_bridge_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_bridge_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_bridge_connections, ai_bridge_jobs FROM anon, authenticated;
GRANT ALL ON ai_bridge_connections, ai_bridge_jobs TO service_role;
