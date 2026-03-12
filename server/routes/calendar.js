import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoCalendarEvents } from '../services/demoData.js';

const router = Router();

// GET /api/calendar
router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const { start, end, platform, event_type } = req.query;
      let events = [...demoCalendarEvents];
      if (platform) events = events.filter(e => e.platform === platform);
      if (event_type) events = events.filter(e => e.event_type === event_type);
      if (start) events = events.filter(e => new Date(e.start_at) >= new Date(start));
      if (end) events = events.filter(e => new Date(e.start_at) <= new Date(end));
      events.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
      return res.json({ data: events });
    }

    const { start, end, platform, event_type } = req.query;
    let query = supabase
      .from('calendar_events')
      .select('*, media_assets(thumbnail_url, title), posts(caption, platform)')
      .order('start_at', { ascending: true });

    if (platform) query = query.eq('platform', platform);
    if (event_type) query = query.eq('event_type', event_type);
    if (start) query = query.gte('start_at', start);
    if (end) query = query.lte('start_at', end);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Calendar GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar
router.post('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Event created (demo)', id: 'cal-' + Date.now() });
    }

    const { title, description, event_type, platform, start_at, end_at, all_day, color, status } = req.body;
    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        title, description, event_type: event_type || 'post',
        platform, start_at, end_at, all_day: all_day || false,
        color: color || '#ec4899', status: status || 'planned',
      })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Calendar POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/calendar/:id
router.put('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.json({ message: 'Event updated (demo)', id: req.params.id });
    }

    const updates = { ...req.body, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Calendar PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ message: 'Event deleted (demo)' });
    const { error } = await supabase.from('calendar_events').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Calendar DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
