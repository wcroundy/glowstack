import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoContentDrafts } from '../services/demoData.js';

const router = Router();

// GET /api/content-drafts
router.get('/', async (req, res) => {
  try {
    const userId = req.userId || 'default';

    if (!isSupabaseConfigured()) {
      const drafts = demoContentDrafts.filter(d => d.user_id === userId && d.status === 'draft');
      return res.json({ data: drafts });
    }

    const { data, error } = await supabase
      .from('content_drafts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Content Drafts GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/content-drafts/:id
router.get('/:id', async (req, res) => {
  try {
    const userId = req.userId || 'default';

    if (!isSupabaseConfigured()) {
      const draft = demoContentDrafts.find(d => d.id === req.params.id && d.user_id === userId);
      if (!draft) return res.status(404).json({ error: 'Draft not found' });
      return res.json(draft);
    }

    const { data, error } = await supabase
      .from('content_drafts')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Content Drafts GET-by-id error:', err.message);
    res.status(404).json({ error: 'Draft not found' });
  }
});

// POST /api/content-drafts
router.post('/', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const { title, idea_notes, shoot_notes, edit_notes, link_notes, platforms, completed_steps } = req.body;

    if (!isSupabaseConfigured()) {
      const draft = {
        id: 'draft-' + Date.now(),
        user_id: userId,
        title, idea_notes, shoot_notes, edit_notes, link_notes,
        platforms: platforms || [], completed_steps: completed_steps || [],
        status: 'draft', calendar_event_id: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      demoContentDrafts.push(draft);
      return res.json(draft);
    }

    const { data, error } = await supabase
      .from('content_drafts')
      .insert({
        user_id: userId,
        title, idea_notes, shoot_notes, edit_notes, link_notes,
        platforms: platforms || [], completed_steps: completed_steps || [],
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Content Drafts POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/content-drafts/:id
router.put('/:id', async (req, res) => {
  try {
    const userId = req.userId || 'default';

    if (!isSupabaseConfigured()) {
      const draft = demoContentDrafts.find(d => d.id === req.params.id && d.user_id === userId);
      if (!draft) return res.status(404).json({ error: 'Draft not found' });
      Object.assign(draft, req.body, { updated_at: new Date().toISOString() });
      return res.json(draft);
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('content_drafts')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Content Drafts PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/content-drafts/:id
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.userId || 'default';

    if (!isSupabaseConfigured()) {
      const idx = demoContentDrafts.findIndex(d => d.id === req.params.id && d.user_id === userId);
      if (idx !== -1) demoContentDrafts.splice(idx, 1);
      return res.json({ message: 'Draft deleted' });
    }

    const { error } = await supabase
      .from('content_drafts')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);
    if (error) throw error;
    res.json({ message: 'Draft deleted' });
  } catch (err) {
    console.error('Content Drafts DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
