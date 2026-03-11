import { Router } from 'express';
import { demoPosts, demoMedia } from '../services/demoData.js';

const router = Router();

router.get('/', (req, res) => {
  const { platform, status, sort = 'published_at', limit = 50 } = req.query;
  let posts = [...demoPosts];
  if (platform && platform !== 'all') posts = posts.filter(p => p.platform === platform);
  if (status) posts = posts.filter(p => p.status === status);
  posts.sort((a, b) => new Date(b[sort] || b.published_at || 0) - new Date(a[sort] || a.published_at || 0));

  const enriched = posts.slice(0, parseInt(limit)).map(p => ({
    ...p,
    media: demoMedia.find(m => m.id === p.media_asset_id),
  }));
  res.json({ data: enriched });
});

router.get('/:id', (req, res) => {
  const post = demoPosts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json({ ...post, media: demoMedia.find(m => m.id === post.media_asset_id) });
});

router.post('/', (req, res) => {
  res.json({ message: 'Post created (demo mode)', id: 'post-' + Date.now() });
});

export default router;
