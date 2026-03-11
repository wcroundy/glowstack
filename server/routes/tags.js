import { Router } from 'express';
import { demoTags } from '../services/demoData.js';

const router = Router();

router.get('/', (req, res) => {
  const { category } = req.query;
  let tags = [...demoTags];
  if (category) tags = tags.filter(t => t.category === category);
  res.json({ data: tags });
});

router.post('/', (req, res) => {
  const { name, color, category } = req.body;
  const tag = { id: 't-' + Date.now(), name, color: color || '#ec4899', category: category || 'custom' };
  demoTags.push(tag);
  res.json(tag);
});

export default router;
