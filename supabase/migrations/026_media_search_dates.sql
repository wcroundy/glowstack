-- Date-aware concept search: restrict to photos taken in [taken_from, taken_to).
-- captured_at (when the photo was taken) is set on every asset; created_at is just import time.
-- The old 3-argument version is dropped so PostgREST doesn't see two candidate overloads.
DROP FUNCTION IF EXISTS search_media_concepts(jsonb, int, int);

CREATE OR REPLACE FUNCTION search_media_concepts(
  concepts jsonb, min_hits int DEFAULT 1, max_results int DEFAULT 200,
  taken_from timestamptz DEFAULT NULL, taken_to timestamptz DEFAULT NULL
)
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
      AND (taken_from IS NULL OR ma.captured_at >= taken_from)
      AND (taken_to IS NULL OR ma.captured_at < taken_to)
  ),
  counted AS (
    SELECT s.*, (SELECT count(*) FROM unnest(s.flags) f WHERE f)::int AS n_hits FROM scored s
  )
  SELECT id, n_hits, flags, count(*) OVER ()
  FROM counted WHERE n_hits >= min_hits
  ORDER BY n_hits DESC, ai_quality_score DESC NULLS LAST, created_at DESC
  LIMIT max_results
$$;

REVOKE EXECUTE ON FUNCTION search_media_concepts(jsonb, int, int, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION search_media_concepts(jsonb, int, int, timestamptz, timestamptz) TO service_role;

-- Date filters on the library listing
CREATE INDEX IF NOT EXISTS media_assets_captured_at_idx ON media_assets (captured_at DESC);
