-- One lowercase, searchable document per asset: title, AI description/products/colors/
-- brands, notes, scene description, and the NAMES of its tags. The tags are where almost
-- all of the descriptive data lives (auto-tagging writes tags, not descriptions), so text
-- search that ignored them found nothing useful.
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION media_build_search_text(
  p_title text, p_description text, p_scene text, p_notes text,
  p_ai_tags text[], p_products text[], p_colors text[], p_brands text[], p_tag_names text
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  -- hyphens/underscores become spaces so "off-white" and "Off White" are the same words
  SELECT translate(lower(concat_ws(' ',
    p_title, p_description, p_scene, p_notes,
    array_to_string(p_ai_tags, ' '), array_to_string(p_products, ' '),
    array_to_string(p_colors, ' '), array_to_string(p_brands, ' '), p_tag_names)), '-_', '  ')
$$;

-- Rebuild the document for the given assets (skips rows whose document wouldn't change).
CREATE OR REPLACE FUNCTION media_refresh_search_text(ids uuid[]) RETURNS void
LANGUAGE sql AS $$
  WITH built AS (
    SELECT ma.id, media_build_search_text(
      ma.title, ma.ai_description, ma.scene_description, ma.notes,
      ma.ai_tags, ma.ai_detected_products, ma.ai_dominant_colors, ma.ai_detected_brands,
      (SELECT string_agg(t.name, ' ') FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ma.id)
    ) AS doc
    FROM media_assets ma WHERE ma.id = ANY(ids)
  )
  UPDATE media_assets ma SET search_text = built.doc
  FROM built WHERE ma.id = built.id AND ma.search_text IS DISTINCT FROM built.doc
$$;

-- Asset's own columns changed (or it was just created)
CREATE OR REPLACE FUNCTION media_assets_search_text_trg() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := media_build_search_text(
    NEW.title, NEW.ai_description, NEW.scene_description, NEW.notes,
    NEW.ai_tags, NEW.ai_detected_products, NEW.ai_dominant_colors, NEW.ai_detected_brands,
    CASE WHEN TG_OP = 'UPDATE' THEN
      (SELECT string_agg(t.name, ' ') FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = NEW.id)
    END);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS media_assets_search_text ON media_assets;
CREATE TRIGGER media_assets_search_text
  BEFORE INSERT OR UPDATE OF title, ai_description, scene_description, notes,
    ai_tags, ai_detected_products, ai_dominant_colors, ai_detected_brands
  ON media_assets FOR EACH ROW EXECUTE FUNCTION media_assets_search_text_trg();

-- Tags added to / removed from assets. Statement-level, so tagging an asset with 20 tags
-- refreshes it once, not 20 times.
CREATE OR REPLACE FUNCTION media_tags_search_text_ins() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM media_refresh_search_text(ARRAY(SELECT DISTINCT media_id FROM new_rows));
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION media_tags_search_text_del() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM media_refresh_search_text(ARRAY(SELECT DISTINCT media_id FROM old_rows));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS media_tags_search_text_ins ON media_tags;
CREATE TRIGGER media_tags_search_text_ins AFTER INSERT ON media_tags
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION media_tags_search_text_ins();
DROP TRIGGER IF EXISTS media_tags_search_text_del ON media_tags;
CREATE TRIGGER media_tags_search_text_del AFTER DELETE ON media_tags
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION media_tags_search_text_del();

-- A tag renamed: refresh the assets that carry it
CREATE OR REPLACE FUNCTION tags_search_text_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM media_refresh_search_text(ARRAY(SELECT media_id FROM media_tags WHERE tag_id = NEW.id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS tags_search_text ON tags;
CREATE TRIGGER tags_search_text AFTER UPDATE OF name ON tags
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION tags_search_text_trg();

-- Backfill existing assets
SELECT media_refresh_search_text(ARRAY(SELECT id FROM media_assets));

-- Exhaustive concept search, used by the AI assistant. `concepts` is a JSON array of
-- synonym lists, e.g. [["cream","ivory"],["floral","flower"],["camo","camouflage"]].
-- An asset "hits" a concept when any of its words appears as a whole word (plural OK)
-- in the document. Returns assets hitting at least min_hits concepts, best first, plus
-- how many assets qualified in total (before the LIMIT).
CREATE OR REPLACE FUNCTION search_media_concepts(concepts jsonb, min_hits int DEFAULT 1, max_results int DEFAULT 200)
RETURNS TABLE (media_id uuid, hits int, hit_flags boolean[], total_matches bigint)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT x.ord, array_agg(
      '\m' || regexp_replace(translate(lower(w), '-_', '  '), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '(s|es)?\M'
    ) AS pats
    FROM jsonb_array_elements(concepts) WITH ORDINALITY AS x(arr, ord),
         jsonb_array_elements_text(x.arr) AS w
    GROUP BY x.ord
  ),
  scored AS (
    SELECT ma.id, ma.ai_quality_score, ma.created_at,
      (SELECT array_agg(EXISTS (SELECT 1 FROM unnest(c.pats) p WHERE ma.search_text ~ p) ORDER BY c.ord) FROM c) AS flags
    FROM media_assets ma
    WHERE NOT ma.is_archived AND ma.parent_asset_id IS NULL AND ma.search_text IS NOT NULL
  ),
  counted AS (
    SELECT s.*, (SELECT count(*) FROM unnest(s.flags) f WHERE f)::int AS n_hits FROM scored s
  )
  SELECT id, n_hits, flags, count(*) OVER ()
  FROM counted WHERE n_hits >= min_hits
  ORDER BY n_hits DESC, ai_quality_score DESC NULLS LAST, created_at DESC
  LIMIT max_results
$$;

REVOKE EXECUTE ON FUNCTION search_media_concepts(jsonb, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_media_concepts(jsonb, int, int) TO service_role;

REVOKE EXECUTE ON FUNCTION media_refresh_search_text(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION media_refresh_search_text(uuid[]) TO service_role;
