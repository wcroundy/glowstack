import { Router } from 'express';
import { demoCalendarEvents } from '../services/demoData.js';

const router = Router();

router.get('/', (req, res) => {
  const { start, end, platform, event_type } = req.query;
  let events = [...demoCalendarEvents];
  if (platform) events = events.filter(e => e.platform === platform);
  if (event_type) events = events.filter(e => e.event_type === event_type);
  if (start) events = events.filter(e => new Date(e.start_at) >= new Date(start));
  if (end) events = events.filter(e => new Date(e.start_at) <= new Date(end));
  events.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  res.json({ data: events });
});

router.post('/', (req, res) => {
  res.json({ message: 'Event created (demo mode)', id: 'cal-' + Date.now() });
});

router.put('/:id', (req, res) => {
  res.json({ message: 'Event updated (demo mode)', id: req.params.id });
});

router.delete('/:id', (req, res) => {
  res.json({ message: 'Event deleted (demo mode)' });
});

export default router;
