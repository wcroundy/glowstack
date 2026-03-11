import { Router } from 'express';
import { demoMedia, demoTags } from '../services/demoData.js';

const router = Router();

// GET /api/media — list all media with optional filters
router.get('/', (req, res) => {
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
  if (tag) {
    assets = assets.filter(a => a.tags?.includes(tag));
  }
  if (type) {
    assets = assets.filter(a => a.file_type === type);
  }
  if (source) {
    assets = assets.filter(a => a.source === source);
  }
  if (favorite === 'true') {
    assets = assets.filter(a => a.is_favorite);
  }
  if (sort === 'quality') {
    assets.sort((a, b) => (b.ai_quality_score || 0) - (a.ai_quality_score || 0));
  } else {
    assets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Enrich with tag objects
  const enriched = assets.map(a => ({
    ...a,
    tag_objects: (a.tags || []).map(tid => demoTags.find(t => t.id === tid)).filter(Boolean),
  }));

  res.json({ data: enriched, total: enriched.length });
});

// GET /api/media/:id
router.get('/:id', (req, res) => {
  const asset = demoMedia.find(m => m.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...asset,
    tag_objects: (asset.tags || []).map(tid => demoTags.find(t => t.id === tid)).filter(Boolean),
  });
});

// POST /api/media/upload (stub)
router.post('/upload', (req, res) => {
  res.json({ message: 'Upload endpoint ready — connect Supabase Storage for file handling', id: 'new-' + Date.now() });
});

// POST /api/media/:id/tag
router.post('/:id/tag', (req, res) => {
  const { tag_id } = req.body;
  res.json({ message: 'Tag added', media_id: req.params.id, tag_id });
});

// POST /api/media/:id/favorite
router.post('/:id/favorite', (req, res) => {
  const asset = demoMedia.find(m => m.id === req.params.id);
  if (asset) asset.is_favorite = !asset.is_favorite;
  res.json({ is_favorite: asset?.is_favorite });
});

export default router;
