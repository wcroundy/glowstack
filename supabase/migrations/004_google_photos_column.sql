-- Add Google Photos ID column for deduplication on import
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS google_photos_id text;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS captured_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_google_photos_id
  ON media_assets(google_photos_id) WHERE google_photos_id IS NOT NULL;
