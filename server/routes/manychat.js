import { Router } from 'express';
import { isSupabaseConfigured } from '../services/supabase.js';
import * as mc from '../services/manychat.js';

const router = Router();

// ─── Status ────────────────────────────────────────────────────────────────────

/** GET /api/manychat/status — Check if ManyChat is connected */
router.get('/status', async (req, res) => {
  try {
    const userId = req.userId || 'default';

    if (!isSupabaseConfigured()) {
      return res.json({ configured: false, connected: false });
    }

    const conn = await mc.getStoredConnection(userId);
    if (!conn?.is_connected) {
      return res.json({ configured: true, connected: false });
    }

    res.json({
      configured: true,
      connected: true,
      page: {
        name: conn.metadata?.page_name || null,
        subscribers: conn.metadata?.subscribers || null,
      },
      lastSynced: conn.metadata?.last_synced || null,
      connectedAt: conn.connected_at,
    });
  } catch (err) {
    console.error('ManyChat status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Connect / Disconnect ──────────────────────────────────────────────────────

/** POST /api/manychat/connect — Store API token and validate it */
router.post('/connect', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const { apiToken } = req.body;

    if (!apiToken || !apiToken.trim()) {
      return res.status(400).json({ error: 'API token is required' });
    }

    const trimmedToken = apiToken.trim();

    // Validate the token by calling getInfo
    const validation = await mc.validateToken(trimmedToken);
    if (!validation.ok) {
      return res.status(401).json({
        error: 'Invalid API token. Please check your ManyChat API key and try again.',
        details: validation.error,
      });
    }

    const pageData = validation.data;

    // Save connection
    const metadata = {
      api_token: trimmedToken,
      page_name: pageData.name || pageData.page_name,
      page_id: pageData.id,
      subscribers: pageData.subscribers,
      connected_at: new Date().toISOString(),
      last_synced: new Date().toISOString(),
    };

    await mc.saveConnection(metadata, userId);
    await mc.logSync(userId, 'connect', { page_name: metadata.page_name });

    res.json({
      success: true,
      page: {
        name: metadata.page_name,
        subscribers: metadata.subscribers,
      },
    });
  } catch (err) {
    console.error('ManyChat connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/disconnect — Remove stored API token */
router.post('/disconnect', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    await mc.removeConnection(userId);
    await mc.logSync(userId, 'disconnect');
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Page Endpoints ────────────────────────────────────────────────────────────

/** GET /api/manychat/page/info — Get page info (refreshes stored data) */
router.get('/page/info', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const pageData = await mc.syncPageInfo(apiToken, userId);
    res.json({ data: pageData });
  } catch (err) {
    console.error('ManyChat page info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/manychat/tags — Get all tags */
router.get('/tags', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.getTags(apiToken);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat tags error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/tags — Create a new tag */
router.post('/tags', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Tag name is required' });
    const result = await mc.createTag(apiToken, name);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat create tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/manychat/tags/:id — Remove a tag */
router.delete('/tags/:id', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.removeTag(apiToken, parseInt(req.params.id));
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat remove tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/manychat/custom-fields — Get all custom fields */
router.get('/custom-fields', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.getCustomFields(apiToken);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat custom fields error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/custom-fields — Create a custom field */
router.post('/custom-fields', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { name, type, description } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
    const result = await mc.createCustomField(apiToken, { name, type, description });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat create custom field error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/manychat/flows — Get all flows */
router.get('/flows', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.getFlows(apiToken);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat flows error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/manychat/growth-tools — Get all growth tools */
router.get('/growth-tools', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.getGrowthTools(apiToken);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat growth tools error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/manychat/bot-fields — Get all bot fields */
router.get('/bot-fields', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.getBotFields(apiToken);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat bot fields error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/bot-fields — Set a bot field value */
router.post('/bot-fields', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { fieldId, fieldName, fieldValue } = req.body;
    let result;
    if (fieldId) {
      result = await mc.setBotField(apiToken, { fieldId, fieldValue });
    } else if (fieldName) {
      result = await mc.setBotFieldByName(apiToken, { fieldName, fieldValue });
    } else {
      return res.status(400).json({ error: 'fieldId or fieldName is required' });
    }
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat set bot field error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Subscriber Endpoints ──────────────────────────────────────────────────────

/** GET /api/manychat/subscribers/:id — Get subscriber info */
router.get('/subscribers/:id', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.getSubscriberInfo(apiToken, req.params.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat subscriber info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/subscribers/search — Search subscribers by name */
router.post('/subscribers/search', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { name, fieldName, fieldValue } = req.body;

    let result;
    if (name) {
      result = await mc.findSubscribersByName(apiToken, name);
    } else if (fieldName && fieldValue !== undefined) {
      result = await mc.findBySystemField(apiToken, { fieldName, fieldValue });
    } else {
      return res.status(400).json({ error: 'Provide name or fieldName+fieldValue to search' });
    }
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat subscriber search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/subscribers — Create a subscriber */
router.post('/subscribers', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const result = await mc.createSubscriber(apiToken, req.body);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ data: result.data });
  } catch (err) {
    console.error('ManyChat create subscriber error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/subscribers/:id/tags — Add tag to subscriber */
router.post('/subscribers/:id/tags', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { tagId, tagName } = req.body;

    let result;
    if (tagId) {
      result = await mc.addSubscriberTag(apiToken, req.params.id, tagId);
    } else if (tagName) {
      result = await mc.addSubscriberTagByName(apiToken, req.params.id, tagName);
    } else {
      return res.status(400).json({ error: 'tagId or tagName is required' });
    }
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat add tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/manychat/subscribers/:id/tags — Remove tag from subscriber */
router.delete('/subscribers/:id/tags', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { tagId, tagName } = req.body;

    let result;
    if (tagId) {
      result = await mc.removeSubscriberTag(apiToken, req.params.id, tagId);
    } else if (tagName) {
      result = await mc.removeSubscriberTagByName(apiToken, req.params.id, tagName);
    } else {
      return res.status(400).json({ error: 'tagId or tagName is required' });
    }
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat remove tag error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/subscribers/:id/custom-fields — Set custom field on subscriber */
router.post('/subscribers/:id/custom-fields', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { fieldId, fieldName, fieldValue } = req.body;

    let result;
    if (fieldId) {
      result = await mc.setSubscriberCustomField(apiToken, req.params.id, fieldId, fieldValue);
    } else if (fieldName) {
      result = await mc.setSubscriberCustomFieldByName(apiToken, req.params.id, fieldName, fieldValue);
    } else {
      return res.status(400).json({ error: 'fieldId or fieldName is required' });
    }
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat set custom field error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Sending Endpoints ─────────────────────────────────────────────────────────

/** POST /api/manychat/send/content — Send dynamic content to a subscriber */
router.post('/send/content', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { subscriberId, data } = req.body;
    if (!subscriberId || !data) {
      return res.status(400).json({ error: 'subscriberId and data are required' });
    }
    const result = await mc.sendContent(apiToken, subscriberId, data);
    if (!result.ok) return res.status(400).json({ error: result.error });
    await mc.logSync(userId, 'send_content', { subscriberId });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat send content error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/manychat/send/flow — Trigger a flow for a subscriber */
router.post('/send/flow', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    const apiToken = await mc.getApiToken(userId);
    const { subscriberId, flowNs } = req.body;
    if (!subscriberId || !flowNs) {
      return res.status(400).json({ error: 'subscriberId and flowNs are required' });
    }
    const result = await mc.sendFlow(apiToken, subscriberId, flowNs);
    if (!result.ok) return res.status(400).json({ error: result.error });
    await mc.logSync(userId, 'send_flow', { subscriberId, flowNs });
    res.json({ success: true });
  } catch (err) {
    console.error('ManyChat send flow error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Sync Log ──────────────────────────────────────────────────────────────────

/** GET /api/manychat/sync-log — Get sync activity log */
router.get('/sync-log', async (req, res) => {
  try {
    const userId = req.userId || 'default';
    if (!isSupabaseConfigured()) return res.json({ data: [] });

    const { supabase } = await import('../services/supabase.js');
    const { data, error } = await supabase
      .from('manychat_sync_log')
      .select('*')
      .eq('user_id', userId)
      .order('synced_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('ManyChat sync log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
