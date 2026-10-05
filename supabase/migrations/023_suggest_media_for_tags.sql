-- Lookups by tag (tag filter, suggested assets) had only the (media_id, tag_id)
-- primary key to work with, so every one scanned all of media_tags.
CREATE INDEX IF NOT EXISTS media_tags_tag_id_idx ON media_tags (tag_id, media_id);

-- Rank assets by how many of the given tags they carry (most relevant first), then
-- by quality and recency. Used to suggest existing assets for a content idea.
CREATE OR REPLACE FUNCTION suggest_media_for_tags(tag_ids uuid[], max_results int DEFAULT 12)
RETURNS TABLE (media_id uuid, matched_tag_ids uuid[], match_count int)
LANGUAGE sql STABLE AS $$
  SELECT mt.media_id, array_agg(mt.tag_id) AS matched_tag_ids, count(*)::int AS match_count
  FROM media_tags mt
  JOIN media_assets ma ON ma.id = mt.media_id AND ma.is_archived = false AND ma.parent_asset_id IS NULL
  WHERE mt.tag_id = ANY(tag_ids)
  GROUP BY mt.media_id, ma.ai_quality_score, ma.created_at
  ORDER BY count(*) DESC, ma.ai_quality_score DESC NULLS LAST, ma.created_at DESC
  LIMIT max_results
$$;

-- Server-side only, like the other private helpers.
REVOKE EXECUTE ON FUNCTION suggest_media_for_tags(uuid[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION suggest_media_for_tags(uuid[], int) TO service_role;
