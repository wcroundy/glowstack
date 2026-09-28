// Usage counters are best-effort metadata; failure must not discard a tagging result.
export async function incrementTagUsage(client, tagIds) {
  for (const tagId of new Set(tagIds)) {
    try {
      // Supabase RPC builders are thenables, not Promises: await them directly.
      await client.rpc('increment_tag_usage', { tag_uuid: tagId });
    } catch {
      // The media_tags association remains the authoritative assignment.
    }
  }
}
