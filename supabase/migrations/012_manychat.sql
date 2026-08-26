-- ============================================================
-- ManyChat integration: sync log table
-- ============================================================

-- ManyChat sync/activity log — tracks connect, disconnect, send events
CREATE TABLE IF NOT EXISTS manychat_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT DEFAULT 'default',
  action TEXT NOT NULL,            -- 'connect', 'disconnect', 'send_content', 'send_flow', etc.
  details JSONB DEFAULT '{}',      -- action-specific metadata
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manychat_sync_log_user ON manychat_sync_log (user_id);
CREATE INDEX IF NOT EXISTS idx_manychat_sync_log_action ON manychat_sync_log (action);
