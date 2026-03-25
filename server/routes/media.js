import { Router } from 'express';
import { supabase, isSupabaseConfigured, uploadFile } from '../services/supabase.js';
import { demoMedia, demoTags } from '../services/demoData.js';

const router = Router();

// GET /api/media — list all media with optional filters
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      let assets = [...demoMedia];
      const { search, tag, type, source, favorite, sort } = req.query;
      if (search) {
        const q = search.toLowerCase();
        assets = assets.filter(a =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.ai_description || '').toLowerCase().includes(q) ||
          (a.ai_tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      if (tag) assets = assets.filter(a => a.tags?.includes(tag));
      if (type) assets = assets.filter(a => a.file_type === type);
      if (source) assets = assets.filter(a => a.source === source);
      if (favorite === 'true') assets = assets.filter(a => a.is_favorite);
      if (sort === 'quality') {
        assets.sort((a, b) => (b.ai_quality_score || 0) - (a.ai_quality_score || 0));
      } else {
        assets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      const enriched = assets.map(a => ({
        ...a,
        tag_objects: (a.tags || []).map(tid => demoTags.find(t => t.id === tid)).filter(Boolean),
      }));
      return res.json({ data: enriched, total: enriched.length });
    }

    // Supabase query
    const { search, tag, type, source, favorite, sort, limit = 50, offset = 0 } = req.query;
    let query = supabase
      .from('media_assets')
      .select('*, media_tags(tag_id, tags(*))', { count: 'exact' })
      .eq('is_archived', false)
      .is('parent_asset_id', null)
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (search) query = query.or(`title.ilike.%${search}%,ai_description.ilike.%${search}%`);
    if (type) query = query.eq('file_type', type);
    if (source) query = query.eq('source', source);
    if (favorite === 'true') query = query.eq('is_favorite', true);
    if (sort === 'quality') {
      query = query.order('ai_quality_score', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, count, error } = await query;
    if (error) throw error;

    // Get scene counts for any video assets in this batch
    const videoIds = (data || []).filter(a => a.file_type === 'video').map(a => a.id);
    let sceneCounts = {};
    if (videoIds.length > 0) {
      const { data: children } = await supabase
        .from('media_assets')
        .select('parent_asset_id')
        .in('parent_asset_id', videoIds);
      if (children) {
        children.forEach(c => {
          sceneCounts[c.parent_asset_id] = (sceneCounts[c.parent_asset_id] || 0) + 1;
        });
      }
    }

    const enriched = (data || []).map(asset => ({
      ...asset,
      tag_objects: (asset.media_tags || []).map(mt => mt.tags).filter(Boolean),
      media_tags: undefined,
      scene_count: sceneCounts[asset.id] || 0,
    }));

    let filtered = enriched;
    if (tag) {
      filtered = enriched.filter(a => a.tag_objects.some(t => t.id === tag || t.name === tag));
    }
    res.json({ data: filtered, total: tag ? filtered.length : count });
  } catch (err) {
    console.error('Media GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media/counts — get total and untagged asset counts
// NOTE: Must be defined before /:id to avoid matching "counts" as an ID
router.get('/counts', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ total: demoMedia.length, untagged: demoMedia.filter(m => !m.tags || m.tags.length === 0).length });
    }

    // Total image count (head:true bypasses row limits, returns exact count)
    const { count: total, error: totalErr } = await supabase
      .from('media_assets')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', false)
      .eq('file_type', 'image');
    if (totalErr) throw totalErr;

    // Tagged image count: query images that have at least one tag via inner join
    // inner join means only rows with matching media_tags are returned
    const { count: taggedImageCount, error: taggedErr } = await supabase
      .from('media_assets')
      .select('id, media_tags!inner(tag_id)', { count: 'exact', head: true })
      .eq('is_archived', false)
      .eq('file_type', 'image');
    if (taggedErr) throw taggedErr;

    const untagged = (total || 0) - (taggedImageCount || 0);

    res.json({ total: total || 0, untagged: Math.max(0, untagged) });
  } catch (err) {
    console.error('Media counts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/media/:id
router.get('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const asset = demoMedia.find(m => m.id === req.params.id);
      if (!asset) return res.status(404).json({ error: 'Not found' });
      return res.json({
        ...asset,
        tag_objects: (asset.tags || []).map(tid => demoTags.find(t => t.id === tid)).filter(Boolean),
      });
    }

    const { data, error } = await supabase
      .from('media_assets')
      .select('*, media_tags(tag_id, is_ai_assigned, confidence, tags(*))')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });

    res.json({
      ...data,
      tag_objects: (data.media_tags || []).map(mt => ({
        ...mt.tags, is_ai_assigned: mt.is_ai_assigned, confidence: mt.confidence,
      })).filter(Boolean),
      media_tags: undefined,
    });
  } catch (err) {
    console.error('Media GET/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/upload
router.post('/upload', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Upload ready — run Supabase migration first', id: 'new-' + Date.now() });
    }

    const { file_name, file_type, mime_type, source = 'upload', title, base64_data } = req.body;
    if (!base64_data) {
      return res.status(400).json({ error: 'No file data provided. Send base64_data in body.' });
    }

    const buffer = Buffer.from(base64_data, 'base64');
    const storagePath = `uploads/${Date.now()}-${file_name}`;
    const result = await uploadFile('media', storagePath, buffer, mime_type || 'image/jpeg');

    const { data, error } = await supabase
      .from('media_assets')
      .insert({
        file_name: file_name || 'untitled',
        file_url: result.publicUrl,
        thumbnail_url: result.publicUrl,
        file_type: file_type || 'image',
        mime_type: mime_type || 'image/jpeg',
        source,
        title: title || file_name,
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Media upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/:id/tag
router.post('/:id/tag', async (req, res) => {
  try {
    const { tag_id } = req.body;
    if (!tag_id) return res.status(400).json({ error: 'tag_id required' });

    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Tag added (demo)', media_id: req.params.id, tag_id });
    }

    const { data, error } = await supabase
      .from('media_tags')
      .upsert({ media_id: req.params.id, tag_id })
      .select();
    if (error) throw error;
    res.json({ message: 'Tag added', data });
  } catch (err) {
    console.error('Media tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:id/tag/:tagId
router.delete('/:id/tag/:tagId', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Tag removed (demo)' });
    const { error } = await supabase
      .from('media_tags')
      .delete()
      .eq('media_id', req.params.id)
      .eq('tag_id', req.params.tagId);
    if (error) throw error;
    res.json({ message: 'Tag removed' });
  } catch (err) {
    console.error('Media untag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/:id/favorite
router.post('/:id/favorite', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const asset = demoMedia.find(m => m.id === req.params.id);
      if (asset) asset.is_favorite = !asset.is_favorite;
      return res.json({ is_favorite: asset?.is_favorite });
    }

    const { data: current } = await supabase
      .from('media_assets').select('is_favorite').eq('id', req.params.id).single();
    const { data, error } = await supabase
      .from('media_assets')
      .update({ is_favorite: !current?.is_favorite, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('is_favorite')
      .single();
    if (error) throw error;
    res.json({ is_favorite: data.is_favorite });
  } catch (err) {
    console.error('Media favorite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/media/:id
router.put('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Updated (demo)', id: req.params.id });

    const { title, notes, album, is_archived } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (album !== undefined) updates.album = album;
    if (is_archived !== undefined) updates.is_archived = is_archived;

    const { data, error } = await supabase
      .from('media_assets').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Media PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Deleted (demo)' });
    const { error } = await supabase.from('media_assets').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Media asset deleted' });
  } catch (err) {
    console.error('Media DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/media/bulk/delete — delete specific assets by ID (and their children)
router.post('/bulk/delete', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ deleted: 0 });

    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }

    // Delete child assets first (scene frames from video breakdown)
    const { data: children } = await supabase
      .from('media_assets')
      .select('id')
      .in('parent_asset_id', ids);

    let childrenDeleted = 0;
    if (children && children.length > 0) {
      const { error: childErr } = await supabase
        .from('media_assets')
        .delete()
        .in('parent_asset_id', ids);
      if (childErr) console.error('Child delete error:', childErr.message);
      else childrenDeleted = children.length;
    }

    // Delete the assets themselves
    const { error } = await supabase
      .from('media_assets')
      .delete()
      .in('id', ids);

    if (error) throw error;

    res.json({ deleted: ids.length, childrenDeleted });
  } catch (err) {
    console.error('Bulk delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/media/bulk/videos — delete all video assets (and their children)
router.delete('/bulk/videos', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ deleted: 0 });

    // First delete child assets (scene frames from video breakdown)
    const { data: videos } = await supabase
      .from('media_assets')
      .select('id')
      .eq('file_type', 'video');

    const videoIds = (videos || []).map(v => v.id);
    let childrenDeleted = 0;

    if (videoIds.length > 0) {
      const { data: children } = await supabase
        .from('media_assets')
        .select('id')
        .in('parent_asset_id', videoIds);

      if (children && children.length > 0) {
        const { error: childErr } = await supabase
          .from('media_assets')
          .delete()
          .in('id', children.map(c => c.id));
        if (childErr) throw childErr;
        childrenDeleted = children.length;
      }
    }

    // Then delete all video assets
    const { error } = await supabase
      .from('media_assets')
      .delete()
      .eq('file_type', 'video');

    if (error) throw error;

    res.json({ deleted: videoIds.length, childrenDeleted });
  } catch (err) {
    console.error('Bulk video delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
