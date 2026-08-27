-- ============================================================
-- Let each purpose (chat vs vision) pin a specific model, not
-- just a provider — model lineups and pricing shift often enough
-- that hardcoding one default isn't durable.
-- ============================================================

ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS chat_model TEXT;
ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS vision_model TEXT;
