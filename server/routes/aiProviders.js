import { Router } from 'express';
import * as ai from '../services/aiProviders.js';
import { bridgeStatus, pairBridge, disconnectBridge } from '../services/aiBridge.js';

const router = Router();
router.post('/bridge/pair', async (req, res) => {
  try { res.json(await pairBridge(req.userId)); }
  catch (err) { res.status(503).json({ error: err.message }); }
});
router.post('/bridge/disconnect', async (req, res) => {
  try { await disconnectBridge(req.userId); res.json({ success: true }); }
  catch (err) { res.status(503).json({ error: err.message }); }
});

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
        modelOptions: ai.AI_PROVIDERS[platform].modelOptions,
        defaultChatModel: ai.AI_PROVIDERS[platform].chatModel,
        defaultVisionModel: ai.AI_PROVIDERS[platform].visionModel,
      };
    }
    const settings = await ai.getAiSettings(userId);
    let bridge;
    try { bridge = await bridgeStatus(userId); }
    catch (err) { bridge = { paired: false, online: false, error: err.message }; }
    res.json({ providers, settings, bridge });
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

    // Clear this provider (and its model choice) from any purpose it was assigned to
    const settings = await ai.getAiSettings(userId);
    const updates = {};
    if (settings.chat_provider === platform) { updates.chat_provider = null; updates.chat_model = null; }
    if (settings.vision_provider === platform) { updates.vision_provider = null; updates.vision_model = null; }
    if (Object.keys(updates).length > 0) await ai.saveAiSettings(userId, updates);

    res.json({ success: true });
  } catch (err) {
    console.error('AI provider disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/ai-providers/settings — assign which connected provider (and optionally
// which specific model) powers chat/vision. Partial: only send the keys you're changing.
router.put('/settings', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const { chat_provider, chat_model, vision_provider, vision_model } = req.body;
    for (const purpose of ['chat', 'vision']) {
      const mode = req.body[`${purpose}_transport`];
      if (mode !== undefined && !['api', 'mcp'].includes(mode)) return res.status(400).json({ error: 'Choose API or MCP.' });
      if (mode === 'mcp' && !(await bridgeStatus(userId)).paired) return res.status(400).json({ error: 'Pair an MCP worker first.' });
      const model = req.body[`${purpose}_model`];
      if (model != null && (typeof model !== 'string' || model.length > 150)) return res.status(400).json({ error: 'Invalid model ID.' });
    }

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

    const updates = {};
    for (const key of ['chat_provider', 'chat_model', 'vision_provider', 'vision_model', 'chat_transport', 'vision_transport']) {
      if (key in req.body) updates[key] = req.body[key];
    }

const saved = await ai.saveAiSettings(userId, updates);
    res.json(saved);
  } catch (err) {
    console.error('AI settings update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
