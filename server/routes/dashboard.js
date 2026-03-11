import { Router } from 'express';
import { demoDashboardWidgets, demoInsights } from '../services/demoData.js';

const router = Router();

router.get('/widgets', (req, res) => {
  res.json({ data: demoDashboardWidgets });
});

router.put('/widgets/:id', (req, res) => {
  const widget = demoDashboardWidgets.find(w => w.id === req.params.id);
  if (!widget) return res.status(404).json({ error: 'Widget not found' });
  Object.assign(widget, req.body);
  res.json(widget);
});

router.get('/insights', (req, res) => {
  res.json({ data: demoInsights });
});

export default router;
