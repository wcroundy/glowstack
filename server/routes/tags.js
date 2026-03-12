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
