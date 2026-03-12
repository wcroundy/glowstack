import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoDashboardWidgets, demoInsights } from '../services/demoData.js';

const router = Router();

// GET /api/dashboard/widgets
router.get('/widgets', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ data: demoDashboardWidgets });
    }

    const { data, error } = await supabase
      .from('dashboard_widgets')
      .select('*')
      .eq('is_visible', true)
      .order('position_y', { ascending: true })
      .order('position_x', { ascending: true });
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Dashboard widgets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dashboard/widgets/:id
router.put('/widgets/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const widget = demoDashboardWidgets.find(w => w.id === req.params.id);
      if (!widget) return res.status(404).json({ error: 'Widget not found' });
      Object.assign(widget, req.body);
      return res.json(widget);
    }

    const { data, error } = await supabase
      .from('dashboard_widgets')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Dashboard widget update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/insights
router.get('/insights', async (req, res) => {
  try {
    // AI insights are generated dynamically for now; use demo data
    // In production, this would analyze recent analytics and generate insights
    res.json({ data: demoInsights });
  } catch (err) {
    console.error('Dashboard insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
