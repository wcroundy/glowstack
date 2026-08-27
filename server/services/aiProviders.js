import { supabase, isSupabaseConfigured } from './supabase.js';

// ─── Provider Config ────────────────────────────────────────────────────────
// Each entry is a BYOK (bring-your-own-key) AI provider a user can connect.
// Users are billed directly by the provider for tokens they use.
export const AI_PROVIDERS = {
  openai: {
    platform: 'openai',
    displayName: 'OpenAI',
    docsUrl: 'https://platform.openai.com/api-keys',
    billingUrl: 'https://platform.openai.com/account/billing',
    keyPlaceholder: 'sk-...',
    chatModel: 'gpt-4o-mini',
    visionModel: 'gpt-4o-mini',
  },
  anthropic: {
    platform: 'anthropic',
    displayName: 'Anthropic (Claude)',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    keyPlaceholder: 'sk-ant-...',
    chatModel: 'claude-haiku-4-5-20251001',
    visionModel: 'claude-haiku-4-5-20251001',
  },
};

// ─── Connection storage (reuses platform_connections, same pattern as ManyChat) ──

export async function getStoredConnection(userId, platform) {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', platform)
    .eq('user_id', userId)
    .single();
  return data;
}

export async function saveProviderConnection(userId, platform, apiToken) {
  if (!isSupabaseConfigured()) return null;
  const config = AI_PROVIDERS[platform];
  const { data, error } = await supabase
    .from('platform_connections')
    .upsert({
      platform,
      user_id: userId,
      display_name: config.displayName,
      is_connected: true,
      connected_at: new Date().toISOString(),
      access_token: apiToken, // stored for consistency with OAuth-style rows
      metadata: { api_token: apiToken, connected_at: new Date().toISOString() },
    }, { onConflict: 'platform,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeProviderConnection(userId, platform) {
  if (!isSupabaseConfigured()) return null;
  const { error } = await supabase
    .from('platform_connections')
    .update({
      is_connected: false,
      access_token: null,
      metadata: { disconnected_at: new Date().toISOString() },
    })
    .eq('platform', platform)
    .eq('user_id', userId);
  if (error) throw error;
}

async function getProviderApiKey(userId, platform) {
  const conn = await getStoredConnection(userId, platform);
  if (!conn?.is_connected || !conn?.metadata?.api_token) return null;
  return conn.metadata.api_token;
}

/** Validate an API key with a cheap, real call to the provider (no completion tokens spent) */
export async function validateProviderToken(platform, apiToken) {
  try {
    if (platform === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error?.message || `OpenAI returned ${res.status}` };
    }
    if (platform === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiToken, 'anthropic-version': '2023-06-01' },
      });
      if (res.ok) return { ok: true };
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error?.message || `Anthropic returned ${res.status}` };
    }
    return { ok: false, error: 'Unknown provider' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Per-purpose assignment (which connected provider powers Chat vs Media Analysis) ──

export async function getAiSettings(userId) {
  if (!isSupabaseConfigured()) return { chat_provider: null, vision_provider: null };
  const { data } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data || { chat_provider: null, vision_provider: null };
}

export async function saveAiSettings(userId, { chat_provider, vision_provider }) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('ai_settings')
    .upsert({
      user_id: userId,
      chat_provider: chat_provider ?? null,
      vision_provider: vision_provider ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function resolveConfig(userId, purpose) {
  const settings = await getAiSettings(userId);
  const provider = purpose === 'chat' ? settings.chat_provider : settings.vision_provider;

  if (provider) {
    const apiKey = await getProviderApiKey(userId, provider);
    if (apiKey) {
      const config = AI_PROVIDERS[provider];
      return { provider, apiKey, model: purpose === 'chat' ? config.chatModel : config.visionModel };
    }
  }

  // Backward-compat fallback for vision only: the old shared env-var key,
  // so existing auto-tagging keeps working until this is reconfigured.
  if (purpose === 'vision' && process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: AI_PROVIDERS.openai.visionModel, isEnvFallback: true };
  }

  return null;
}

export const getChatConfig = (userId) => resolveConfig(userId, 'chat');
export const getVisionConfig = (userId) => resolveConfig(userId, 'vision');

async function providerError(provider, res) {
  const bodyText = await res.text();
  let detail = bodyText;
  try { detail = JSON.parse(bodyText).error?.message || detail; } catch (_) {}

  const isQuota = res.status === 429 || res.status === 402
    || /insufficient_quota|billing|credit balance/i.test(bodyText);

  const err = new Error(detail || `${provider} returned ${res.status}`);
  err.status = res.status;
  err.provider = provider;
  err.code = isQuota ? 'ai_insufficient_quota' : 'ai_provider_error';
  return err;
}

// ─── Chat completion ──────────────────────────────────────────────────────────

/**
 * messages: [{ role: 'system'|'user'|'assistant', content: string }]
 * Returns the assistant's text reply, or null if no chat provider is configured.
 */
export async function chatComplete(userId, messages) {
  const config = await getChatConfig(userId);
  if (!config) return null;

  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 800, temperature: 0.6 }),
    });
    if (!res.ok) throw await providerError('openai', res);
    const result = await res.json();
    return result.choices?.[0]?.message?.content || '';
  }

  if (config.provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const turns = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: config.model, max_tokens: 800, system: systemMsg, messages: turns }),
    });
    if (!res.ok) throw await providerError('anthropic', res);
    const result = await res.json();
    return (result.content || []).map(b => b.text).filter(Boolean).join('\n');
  }

  throw new Error(`Unsupported chat provider: ${config.provider}`);
}

// ─── Vision completion (image analysis) ───────────────────────────────────────

/**
 * imageUrls: string[] — publicly reachable URLs or data: URLs
 * Returns { text, usage: { totalTokens } }. Throws (err.code === 'ai_not_configured'
 * or 'ai_insufficient_quota') if no vision provider is connected or the call fails.
 */
export async function visionComplete(userId, { systemPrompt, userText, imageUrls, maxTokens = 1000, temperature = 0.3 }) {
  const config = await getVisionConfig(userId);
  if (!config) {
    const err = new Error('No AI vision provider connected. Add one in Integrations.');
    err.code = 'ai_not_configured';
    throw err;
  }

  if (config.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              ...imageUrls.map(url => ({ type: 'image_url', image_url: { url, detail: 'auto' } })),
            ],
          },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!res.ok) throw await providerError('openai', res);
    const result = await res.json();
    return {
      text: result.choices?.[0]?.message?.content || '',
      usage: { totalTokens: result.usage?.total_tokens || 0 },
    };
  }

  if (config.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              ...imageUrls.map(url => ({ type: 'image', source: { type: 'url', url } })),
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw await providerError('anthropic', res);
    const result = await res.json();
    const text = (result.content || []).map(b => b.text).filter(Boolean).join('\n');
    const totalTokens = (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0);
    return { text, usage: { totalTokens } };
  }

  throw new Error(`Unsupported vision provider: ${config.provider}`);
}
