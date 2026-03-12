import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoPosts, demoMedia } from '../services/demoData.js';

const router = Router();

// GET /api/posts
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const { platform, status, sort = 'published_at', limit = 50 } = req.query;
      let posts = [...demoPosts];
      if (platform && platform !== 'all') posts = posts.filter(p => p.platform === platform);
      if (status) posts = posts.filter(p => p.status === status);
      posts.sort((a, b) => new Date(b[sort] || b.published_at || 0) - new Date(a[sort] || a.published_at || 0));
      const enriched = posts.slice(0, parseInt(limit)).map(p => ({
        ...p, media: demoMedia.find(m => m.id === p.media_asset_id),
      }));
      return res.json({ data: enriched });
    }

    const { platform, status, sort = 'published_at', limit = 50, offset = 0 } = req.query;
    let query = supabase
      .from('posts')
      .select('*, media_assets(*)', { count: 'exact' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (platform && platform !== 'all') query = query.eq('platform', platform);
    if (status) query = query.eq('status', status);
    query = query.order(sort === 'scheduled_for' ? 'scheduled_for' : 'published_at', { ascending: false, nullsFirst: false });

    const { data, count, error } = await query;
    if (error) throw error;

    const enriched = (data || []).map(p => ({
      ...p, media: p.media_assets || null, media_assets: undefined,
    }));
    res.json({ data: enriched, total: count });
  } catch (err) {
    console.error('Posts GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const post = demoPosts.find(p => p.id === req.params.id);
      if (!post) return res.status(404).json({ error: 'Not found' });
      return res.json({ ...post, media: demoMedia.find(m => m.id === post.media_asset_id) });
    }

    const { data, error } = await supabase
      .from('posts').select('*, media_assets(*)').eq('id', req.params.id).single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ ...data, media: data.media_assets, media_assets: undefined });
  } catch (err) {
    console.error('Posts GET/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/posts
router.post('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Post created (demo mode)', id: 'post-' + Date.now() });
    }

    const { platform, post_type, caption, hashtags, media_asset_id, status, scheduled_for } = req.body;
    const insert = {
      platform, post_type, caption,
      hashtags: hashtags || [],
      media_asset_id: media_asset_id || null,
      status: status || 'draft',
    };
    if (status === 'scheduled' && scheduled_for) insert.scheduled_for = scheduled_for;
    if (status === 'published') insert.published_at = new Date().toISOString();

    const { data, error } = await supabase.from('posts').insert(insert).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Posts POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/posts/:id
router.put('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Updated (demo)', id: req.params.id });
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('posts').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Posts PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Deleted (demo)' });
    const { error } = await supabase.from('posts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Posts DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
