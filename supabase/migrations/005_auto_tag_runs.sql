-- Auto-tag run history
CREATE TABLE IF NOT EXISTS auto_tag_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  scope TEXT NOT NULL DEFAULT 'all', -- 'all' or 'untagged'
  total_images_processed INTEGER NOT NULL DEFAULT 0,
  total_images_tagged INTEGER NOT NULL DEFAULT 0,
  total_tags_applied INTEGER NOT NULL DEFAULT 0,
  suggested_tags_count INTEGER NOT NULL DEFAULT 0,
  accepted_tags_count INTEGER NOT NULL DEFAULT 0,
  ai_powered BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'partial'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_auto_tag_runs_started_at ON auto_tag_runs (started_at DESC);
