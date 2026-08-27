import { Router } from 'express';
import * as ai from '../services/aiProviders.js';

const router = Router();

// GET /api/ai-providers/status — connection state for every known provider + current assignments
router.get('/status', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const providers = {};
    for (const platform of Object.keys(ai.AI_PROVIDERS)) {
      const conn = await ai.getStoredConnection(userId, platform);
      providers[platform] = {
        connected: !!conn?.is_connected,
        connectedAt: conn?.connected_at || null,
      };
    }
    const settings = await ai.getAiSettings(userId);
    res.json({ providers, settings });
  } catch (err) {
    console.error('AI providers status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-providers/:platform/connect — validate + store an API key
router.post('/:platform/connect', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const { platform } = req.params;
    const { apiToken } = req.body;

    if (!ai.AI_PROVIDERS[platform]) {
      return res.status(400).json({ error: 'Unknown AI provider' });
    }
    if (!apiToken || !apiToken.trim()) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const trimmed = apiToken.trim();
    const validation = await ai.validateProviderToken(platform, trimmed);
    if (!validation.ok) {
      // 400, not 401 — a 401 from ANY endpoint makes the frontend's global fetch
      // handler treat it as "your GlowStack session expired" and force a logout.
      // This is about the third-party key being invalid, not the user's GlowStack session.
      return res.status(400).json({ error: 'Invalid API key. Please check it and try again.', details: validation.error });
    }

    await ai.saveProviderConnection(userId, platform, trimmed);
    res.json({ success: true });
  } catch (err) {
    console.error('AI provider connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai-providers/:platform/disconnect
router.post('/:platform/disconnect', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const { platform } = req.params;
    if (!ai.AI_PROVIDERS[platform]) {
      return res.status(400).json({ error: 'Unknown AI provider' });
    }

    await ai.removeProviderConnection(userId, platform);

    // Clear this provider from any purpose it was assigned to
    const settings = await ai.getAiSettings(userId);
    const updates = { chat_provider: settings.chat_provider, vision_provider: settings.vision_provider };
    if (updates.chat_provider === platform) updates.chat_provider = null;
    if (updates.vision_provider === platform) updates.vision_provider = null;
    await ai.saveAiSettings(userId, updates);

    res.json({ success: true });
  } catch (err) {
    console.error('AI provider disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai-providers/settings — assign which connected provider powers chat/vision
router.put('/settings', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const { chat_provider, vision_provider } = req.body;

    for (const [purpose, platform] of [['chat', chat_provider], ['vision', vision_provider]]) {
      if (!platform) continue;
      if (!ai.AI_PROVIDERS[platform]) {
        return res.status(400).json({ error: `Unknown provider for ${purpose}: ${platform}` });
      }
      const conn = await ai.getStoredConnection(userId, platform);
      if (!conn?.is_connected) {
        return res.status(400).json({ error: `${ai.AI_PROVIDERS[platform].displayName} is not connected yet.` });
      }
    }

    const saved = await ai.saveAiSettings(userId, { chat_provider, vision_provider });
    res.json(saved);
  } catch (err) {
    console.error('AI settings update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
