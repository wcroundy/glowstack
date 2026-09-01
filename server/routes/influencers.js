import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { getValidPageToken, getBusinessDiscovery } from '../services/meta.js';

const router = Router();

function mapMediaToPostRow(watchedInfluencerId, media) {
  return {
    watched_influencer_id: watchedInfluencerId,
    platform_post_id: media.id,
    post_url: media.permalink,
    caption: media.caption,
    media_type: (media.media_product_type || media.media_type || '').toLowerCase(),
    thumbnail_url: media.thumbnail_url || media.media_url,
    likes: media.like_count || 0,
    comments: media.comments_count || 0,
    published_at: media.timestamp,
    synced_at: new Date().toISOString(),
  };
}

// GET /api/influencers — list watched influencers with basic post counts
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ data: [] });
    const userId = req.userId || 'default';

    const { data, error } = await supabase
      .from('watched_influencers')
      .select('*, watched_posts(count)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const enriched = (data || []).map((row) => ({
      ...row,
      post_count: row.watched_posts?.[0]?.count || 0,
      watched_posts: undefined,
    }));
    res.json({ data: enriched });
  } catch (err) {
    console.error('Influencers GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/influencers — add a new watched influencer (validates + does an initial sync)
router.post('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.status(400).json({ error: 'Supabase not configured' });
    const userId = req.userId || 'default';
    const { username, notes } = req.body;
    const cleanUsername = (username || '').trim().replace(/^@/, '');

    if (!cleanUsername) {
      return res.status(400).json({ error: 'Instagram username is required' });
    }

    const { pageAccessToken, igUserId } = await getValidPageToken(userId);
    if (!igUserId) {
      return res.status(400).json({ error: 'Connect your own Instagram Business account first (Integrations) — it\'s used to look up other accounts.' });
    }

    let discovery;
    try {
      discovery = await getBusinessDiscovery(igUserId, cleanUsername, pageAccessToken);
    } catch (lookupErr) {
      return res.status(400).json({ error: lookupErr.message });
    }

    const { data: influencer, error } = await supabase
      .from('watched_influencers')
      .upsert({
        user_id: userId,
        platform: 'instagram',
        username: discovery.username,
        display_name: discovery.name,
        bio: discovery.biography,
        profile_picture_url: discovery.profile_picture_url,
        followers_count: discovery.followers_count,
        follows_count: discovery.follows_count,
        media_count: discovery.media_count,
        notes: notes || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'platform,username,user_id' })
      .select()
      .single();
    if (error) throw error;

    const media = discovery.media?.data || [];
    if (media.length > 0) {
      const rows = media.map((m) => mapMediaToPostRow(influencer.id, m));
      const { error: postErr } = await supabase
        .from('watched_posts')
        .upsert(rows, { onConflict: 'watched_influencer_id,platform_post_id' });
      if (postErr) console.error('Watched posts upsert error:', postErr.message);
    }

    res.json({ ...influencer, post_count: media.length });
  } catch (err) {
    console.error('Influencers POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/influencers/:id/sync — refresh one influencer's stats + recent posts
router.post('/:id/sync', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.status(400).json({ error: 'Supabase not configured' });
    const userId = req.userId || 'default';

    const { data: influencer, error: findErr } = await supabase
      .from('watched_influencers')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (findErr || !influencer) return res.status(404).json({ error: 'Not found' });

    const { pageAccessToken, igUserId } = await getValidPageToken(userId);
    const discovery = await getBusinessDiscovery(igUserId, influencer.username, pageAccessToken);

    const { data: updated, error } = await supabase
      .from('watched_influencers')
      .update({
        display_name: discovery.name,
        bio: discovery.biography,
        profile_picture_url: discovery.profile_picture_url,
        followers_count: discovery.followers_count,
        follows_count: discovery.follows_count,
        media_count: discovery.media_count,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', influencer.id)
      .select()
      .single();
    if (error) throw error;

    const media = discovery.media?.data || [];
    if (media.length > 0) {
      const rows = media.map((m) => mapMediaToPostRow(influencer.id, m));
      await supabase.from('watched_posts').upsert(rows, { onConflict: 'watched_influencer_id,platform_post_id' });
    }

    res.json({ ...updated, post_count: media.length });
  } catch (err) {
    console.error('Influencer sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/influencers/:id/posts — their stored posts, most-engaged first
router.get('/:id/posts', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ data: [] });
    const userId = req.userId || 'default';

    // Confirm ownership before returning posts
    const { data: influencer } = await supabase
      .from('watched_influencers')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (!influencer) return res.status(404).json({ error: 'Not found' });

    const { data, error } = await supabase
      .from('watched_posts')
      .select('*')
      .eq('watched_influencer_id', req.params.id)
      .order('likes', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Watched posts GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/influencers/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Deleted (demo)' });
    const userId = req.userId || 'default';
    const { error } = await supabase
      .from('watched_influencers')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ message: 'Removed from watchlist' });
  } catch (err) {
    console.error('Influencer DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
