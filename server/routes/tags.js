import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoTags } from '../services/demoData.js';

const router = Router();

// GET /api/tags
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const { category } = req.query;
      let tags = [...demoTags];
      if (category) tags = tags.filter(t => t.category === category);
      return res.json({ data: tags });
    }

    let query = supabase.from('tags').select('*').order('usage_count', { ascending: false });
    if (req.query.category) query = query.eq('category', req.query.category);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Tags GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags
router.post('/', async (req, res) => {
  try {
    const { name, color, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    if (!isSupabaseConfigured()) {
      const tag = { id: 't-' + Date.now(), name, color: color || '#ec4899', category: category || 'custom' };
      demoTags.push(tag);
      return res.json(tag);
    }

    const { data, error } = await supabase
      .from('tags')
      .insert({ name, color: color || '#ec4899', category: category || 'custom' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Tags POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tags/auto-tag-runs — Get auto-tag run history
router.get('/auto-tag-runs', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ data: [] });
    }
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const { data, error } = await supabase
      .from('auto_tag_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Auto-tag runs GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags/auto-tag-runs — Create a new auto-tag run record
router.post('/auto-tag-runs', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ id: 'demo-run' });
    }
    const { scope } = req.body;
    const { data, error } = await supabase
      .from('auto_tag_runs')
      .insert({ scope: scope || 'all', status: 'running' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Auto-tag runs POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tags/auto-tag-runs/:id — Update a run record (on completion or failure)
router.patch('/auto-tag-runs/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Updated (demo)' });
    }
    const { id } = req.params;
    const updates = req.body; // status, total_images_processed, total_images_tagged, etc.
    const { data, error } = await supabase
      .from('auto_tag_runs')
      .update({ ...updates, completed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Auto-tag runs PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Tag Categories
// ============================================================

// GET /api/tags/categories — list all categories
router.get('/categories', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ data: [
        { id: '1', name: 'content_type', label: 'Content Type', color: '#3b82f6', is_default: true, sort_order: 0 },
        { id: '2', name: 'aesthetic', label: 'Aesthetic', color: '#ec4899', is_default: true, sort_order: 1 },
        { id: '3', name: 'product', label: 'Product', color: '#f97316', is_default: true, sort_order: 2 },
        { id: '4', name: 'brand', label: 'Brand', color: '#8b5cf6', is_default: true, sort_order: 3 },
        { id: '5', name: 'platform', label: 'Platform', color: '#06b6d4', is_default: true, sort_order: 4 },
        { id: '6', name: 'campaign', label: 'Campaign', color: '#22c55e', is_default: true, sort_order: 5 },
        { id: '7', name: 'custom', label: 'Custom', color: '#6366f1', is_default: true, sort_order: 6 },
      ] });
    }
    const { data, error } = await supabase
      .from('tag_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('Categories GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags/categories — create a new category
router.post('/categories', async (req, res) => {
  try {
    const { label, color } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Label is required' });

    // Generate a name key from the label
    const name = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!name) return res.status(400).json({ error: 'Invalid label' });

    if (!isSupabaseConfigured()) {
      return res.json({ id: 'cat-' + Date.now(), name, label: label.trim(), color: color || '#6366f1', is_default: false, sort_order: 99 });
    }

    // Get next sort_order
    const { data: maxRow } = await supabase
      .from('tag_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();
    const nextOrder = (maxRow?.sort_order ?? 6) + 1;

    const { data, error } = await supabase
      .from('tag_categories')
      .insert({ name, label: label.trim(), color: color || '#6366f1', sort_order: nextOrder })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Categories POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tags/categories/:id — update a category
router.patch('/categories/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Updated (demo)' });
    const { label, color } = req.body;
    const updates = {};
    if (label) updates.label = label.trim();
    if (color) updates.color = color;
    const { data, error } = await supabase
      .from('tag_categories')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Categories PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/categories/:id — delete a category (move tags to 'custom')
router.delete('/categories/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Deleted (demo)' });

    // Get the category to check if it's default
    const { data: cat, error: catErr } = await supabase
      .from('tag_categories')
      .select('name, is_default')
      .eq('id', req.params.id)
      .single();
    if (catErr) throw catErr;
    if (cat.is_default) return res.status(400).json({ error: 'Cannot delete default categories' });

    // Move tags in this category to 'custom'
    await supabase
      .from('tags')
      .update({ category: 'custom' })
      .eq('category', cat.name);

    // Delete the category
    const { error } = await supabase
      .from('tag_categories')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Category deleted, tags moved to Custom' });
  } catch (err) {
    console.error('Categories DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tags/:id — update a tag (name, color, category)
router.patch('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Updated (demo)' });
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.color) updates.color = req.body.color;
    if (req.body.category !== undefined) updates.category = req.body.category;
    const { data, error } = await supabase
      .from('tags')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Tags PATCH error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Tag deleted (demo mode)' });
    }
    const { error } = await supabase.from('tags').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('Tags DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
