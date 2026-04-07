-- Enterprise Meta integration upgrades
-- Supports multi-user connections, token expiry tracking, and webhook events

-- Add token expiry tracking columns to platform_connections
ALTER TABLE platform_connections
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_refreshed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_id TEXT;  -- associate connection with a specific user

-- Create index for quick user-specific connection lookups
CREATE INDEX IF NOT EXISTS idx_platform_connections_user
  ON platform_connections (platform, user_id);

-- Webhook events log — stores raw webhook payloads for debugging and audit
CREATE TABLE IF NOT EXISTS meta_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,          -- 'page', 'instagram', etc.
  source_id TEXT,                    -- page ID or IG user ID
  field TEXT,                        -- change field name
  verb TEXT,                         -- 'add', 'update', 'remove', etc.
  payload JSONB DEFAULT '{}',        -- raw event payload
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON meta_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON meta_webhook_events (processed) WHERE NOT processed;

-- Data deletion requests log — required for Meta compliance
CREATE TABLE IF NOT EXISTS meta_data_deletion_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_user_id TEXT NOT NULL,
  confirmation_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, completed, failed
  requested_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Add user_id to insights tables for multi-account support
ALTER TABLE facebook_insights ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE instagram_insights ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Add sync_type 'webhook' to meta_sync_log (was only 'full' or 'incremental')
-- No migration needed — sync_type is TEXT, new values just work
