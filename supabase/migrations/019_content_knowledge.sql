-- Private evidence library. Access is through the authenticated server only.
CREATE TABLE IF NOT EXISTS content_knowledge (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
ALTER TABLE content_knowledge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON content_knowledge FROM anon, authenticated;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS content_plan JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS metrics_refresh JSONB;
