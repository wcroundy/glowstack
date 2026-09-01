import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { getValidPageToken, getHashtagId, getHashtagTopMedia } from '../services/meta.js';

const router = Router();

function mapMediaToHashtagPostRow(watchedHashtagId, media) {
  return {
    watched_hashtag_id: watchedHashtagId,
    platform_post_id: media.id,
    post_url: media.permalink,
    caption: media.caption,
    media_type: (media.media_product_type || media.media_type || '').toLowerCase(),
    likes: media.like_count || 0,
    comments: media.comments_count || 0,
    published_at: media.timestamp,
    synced_at: new Date().toISOString(),
  };
}

// GET /api/hashtags — list watched hashtags with post counts
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ data: [] });
    const userId = req.userId || 'default';

    const { data, error } = await supabase
      .from('watched_hashtags')
      .select('*, hashtag_posts(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const enriched = (data || []).map((row) => ({
      ...row,
      post_count: row.hashtag_posts?.[0]?.count || 0,
      hashtag_posts: undefined,
    }));
    res.json({ data: enriched });
  } catch (err) {
    console.error('Hashtags GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags — track a new hashtag (resolves its ID + does an initial pull)
router.post('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.status(400).json({ error: 'Supabase not configured' });
    const userId = req.userId || 'default';
    const cleanHashtag = (req.body.hashtag || '').trim().replace(/^#/, '').toLowerCase();

    if (!cleanHashtag) {
      return res.status(400).json({ error: 'Hashtag is required' });
    }

    const { pageAccessToken, igUserId } = await getValidPageToken(userId);
    if (!igUserId) {
      return res.status(400).json({ error: 'Connect your own Instagram Business account first (Integrations).' });
    }

    let hashtagId, media;
    try {
      hashtagId = await getHashtagId(igUserId, cleanHashtag, pageAccessToken);
      media = await getHashtagTopMedia(igUserId, hashtagId, pageAccessToken);
    } catch (lookupErr) {
      return res.status(400).json({ error: lookupErr.message });
    }

    const { data: watched, error } = await supabase
      .from('watched_hashtags')
      .upsert({
        user_id: userId,
        platform: 'instagram',
        hashtag: cleanHashtag,
        hashtag_id: hashtagId,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'platform,hashtag,user_id' })
      .select()
      .single();
    if (error) throw error;

    if (media.length > 0) {
      const rows = media.map((m) => mapMediaToHashtagPostRow(watched.id, m));
      const { error: postErr } = await supabase
        .from('hashtag_posts')
        .upsert(rows, { onConflict: 'watched_hashtag_id,platform_post_id' });
      if (postErr) console.error('Hashtag posts upsert error:', postErr.message);
    }

    res.json({ ...watched, post_count: media.length });
  } catch (err) {
    console.error('Hashtags POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hashtags/:id/sync — refresh top media for one hashtag (reuses cached hashtag_id)
router.post('/:id/sync', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.status(400).json({ error: 'Supabase not configured' });
    const userId = req.userId || 'default';

    const { data: watched, error: findErr } = await supabase
      .from('watched_hashtags')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (findErr || !watched) return res.status(404).json({ error: 'Not found' });

    const { pageAccessToken, igUserId } = await getValidPageToken(userId);
    const media = await getHashtagTopMedia(igUserId, watched.hashtag_id, pageAccessToken);

    await supabase
      .from('watched_hashtags')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', watched.id);

    if (media.length > 0) {
      const rows = media.map((m) => mapMediaToHashtagPostRow(watched.id, m));
      await supabase.from('hashtag_posts').upsert(rows, { onConflict: 'watched_hashtag_id,platform_post_id' });
    }

    res.json({ ...watched, post_count: media.length });
  } catch (err) {
    console.error('Hashtag sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hashtags/:id/posts — stored posts, most-engaged first
router.get('/:id/posts', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ data: [] });
    const userId = req.userId || 'default';

    const { data: watched } = await supabase
      .from('watched_hashtags')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (!watched) return res.status(404).json({ error: 'Not found' });

    const { data, error } = await supabase
      .from('hashtag_posts')
      .select('*')
      .eq('watched_hashtag_id', req.params.id)
      .order('likes', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Hashtag posts GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hashtags/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Deleted (demo)' });
    const userId = req.userId || 'default';
    const { error } = await supabase
      .from('watched_hashtags')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ message: 'Removed' });
  } catch (err) {
    console.error('Hashtag DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
