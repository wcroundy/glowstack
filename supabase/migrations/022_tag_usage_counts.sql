-- tags.usage_count was never maintained: the app called an increment_tag_usage()
-- RPC that was never created, and the resulting error was swallowed, so every tag
-- showed "0 assets" in Tag Manager and tag ranking by popularity had no signal.
-- Keep the counter correct in the database itself so it holds for every code path
-- (manual tagging, auto-tagging, asset/tag deletion, cascades).

-- Block writes briefly so the backfill and the trigger can't miss a concurrent insert.
LOCK TABLE media_tags IN SHARE ROW EXCLUSIVE MODE;

UPDATE tags SET usage_count = 0;
UPDATE tags t
SET usage_count = c.n
FROM (SELECT tag_id, count(*)::int AS n FROM media_tags GROUP BY tag_id) c
WHERE c.tag_id = t.id;

CREATE OR REPLACE FUNCTION sync_tag_usage_count() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tags SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = NEW.tag_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tags SET usage_count = GREATEST(COALESCE(usage_count, 0) - 1, 0) WHERE id = OLD.tag_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS media_tags_usage_count ON media_tags;
CREATE TRIGGER media_tags_usage_count
  AFTER INSERT OR DELETE ON media_tags
  FOR EACH ROW EXECUTE FUNCTION sync_tag_usage_count();
