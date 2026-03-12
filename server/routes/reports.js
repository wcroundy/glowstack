import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';

const router = Router();
const demoReports = [];

// GET /api/reports
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ data: demoReports });

    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Reports GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reports/generate
router.post('/generate', async (req, res) => {
  try {
    const { report_type = 'weekly', platforms = ['all'] } = req.body;

    const reportContent = `# ${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Performance Report

## Overview
Total reach: 2.84M (+12.8%)
Avg engagement: 8.6% (+1.3%)
Revenue: $7,431.50 (+22.5%)

## Top Content
1. GRWM Date Night (TikTok) — 1.65M views, 12.1% engagement
2. Summer Glam Look (Instagram) — 285K reach, 9.2% engagement
3. Fall OOTD (Pinterest) — 125K reach, $2,100 revenue

## Recommendations
- Increase GRWM content frequency on TikTok
- Leverage Pinterest for affiliate revenue
- Post during identified peak engagement windows`;

    if (!isSupabaseConfigured()) {
      const report = {
        id: 'rpt-' + Date.now(),
        title: `${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Performance Report`,
        report_type, platforms, status: 'ready',
        date_from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
        date_to: new Date().toISOString().slice(0, 10),
        content: reportContent,
        created_at: new Date().toISOString(),
      };
      demoReports.push(report);
      return res.json(report);
    }

    const { data, error } = await supabase
      .from('reports')
      .insert({
        title: `${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Performance Report`,
        report_type, platforms,
        date_from: new Date(Date.now() - (report_type === 'monthly' ? 30 : 7) * 86400000).toISOString().slice(0, 10),
        date_to: new Date().toISOString().slice(0, 10),
        content: reportContent,
        status: 'ready',
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Reports generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/:id
router.get('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const report = demoReports.find(r => r.id === req.params.id);
      if (!report) return res.status(404).json({ error: 'Not found' });
      return res.json(report);
    }

    const { data, error } = await supabase
      .from('reports').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Reports GET/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
