-- Tag instructions: tell the AI what a tag means when it isn't something a vision model
-- would know on its own ("Blush Basics Collection" = the pink logo hoodie, etc.).
ALTER TABLE tags ADD COLUMN IF NOT EXISTS ai_instructions TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS instructions_updated_at TIMESTAMPTZ;

-- When this tag was last checked against the WHOLE library (a targeted run, or a full
-- "all assets" run). NULL, or instructions edited since, means the tag is "new": older
-- photos have never been looked at for it. Untagged-only runs don't count — they only
-- look at new photos.
ALTER TABLE tags ADD COLUMN IF NOT EXISTS last_library_run_at TIMESTAMPTZ;

-- Every existing tag is the baseline; tags created from here on start out "new".
UPDATE tags SET last_library_run_at = now() WHERE last_library_run_at IS NULL;

-- Targeted runs record which tags they covered
ALTER TABLE auto_tag_runs ADD COLUMN IF NOT EXISTS tag_ids UUID[];
