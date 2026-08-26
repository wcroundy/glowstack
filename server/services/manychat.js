import { supabase, isSupabaseConfigured } from './supabase.js';

// ─── Config ────────────────────────────────────────────────────────────────────
const MANYCHAT_API = 'https://api.manychat.com/fb';

// ─── Rate Limit Config ─────────────────────────────────────────────────────────
// ManyChat rate limits: Page GET 100/s, POST 10/s, Subscriber 10-50/s, Sending 25/s
const RATE_LIMIT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10000,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── API Fetch Wrapper ─────────────────────────────────────────────────────────

/**
 * Fetch wrapper for ManyChat API with rate limit handling.
 * All ManyChat endpoints use Bearer token auth.
 */
async function manychatFetch(apiToken, path, options = {}, retries = 0) {
  const url = `${MANYCHAT_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
      ...options.headers,
    },
  });

  // Rate limit handling
  if (res.status === 429 && retries < RATE_LIMIT_CONFIG.maxRetries) {
    const delay = Math.min(
      RATE_LIMIT_CONFIG.baseDelayMs * Math.pow(2, retries),
      RATE_LIMIT_CONFIG.maxDelayMs
    );
    console.warn(`ManyChat API rate limited, retry ${retries + 1}/${RATE_LIMIT_CONFIG.maxRetries} in ${delay}ms`);
    await sleep(delay);
    return manychatFetch(apiToken, path, options, retries + 1);
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.status === 'error') {
    return {
      ok: false,
      status: res.status,
      error: body.message || body.error || `ManyChat API error: ${res.status}`,
      data: body,
    };
  }

  return { ok: true, status: res.status, data: body.data || body };
}

// ─── Connection Management ─────────────────────────────────────────────────────

/** Get stored ManyChat connection from Supabase */
export async function getStoredConnection(userId = 'default') {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', 'manychat')
    .eq('user_id', userId)
    .single();
  return data;
}

/** Get a valid API token for ManyChat */
export async function getApiToken(userId = 'default') {
  const conn = await getStoredConnection(userId);
  if (!conn?.is_connected || !conn?.metadata?.api_token) {
    throw new Error('ManyChat is not connected. Please add your API token in Integrations.');
  }
  return conn.metadata.api_token;
}

/** Save ManyChat connection to Supabase */
export async function saveConnection(metadata, userId = 'default') {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('platform_connections')
    .upsert({
      platform: 'manychat',
      user_id: userId,
      display_name: 'ManyChat',
      is_connected: true,
      connected_at: new Date().toISOString(),
      access_token: metadata.api_token, // stored for consistency
      metadata,
    }, { onConflict: 'platform,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Remove ManyChat connection */
export async function removeConnection(userId = 'default') {
  if (!isSupabaseConfigured()) return null;
  const { error } = await supabase
    .from('platform_connections')
    .update({
      is_connected: false,
      access_token: null,
      metadata: { disconnected_at: new Date().toISOString() },
    })
    .eq('platform', 'manychat')
    .eq('user_id', userId);
  if (error) throw error;
}

/** Validate an API token by calling getInfo */
export async function validateToken(apiToken) {
  const result = await manychatFetch(apiToken, '/page/getInfo');
  return result;
}

// ─── Page Endpoints ────────────────────────────────────────────────────────────

/** GET /fb/page/getInfo — Page name, subscribers, etc. */
export async function getPageInfo(apiToken) {
  return manychatFetch(apiToken, '/page/getInfo');
}

/** GET /fb/page/getTags — All tags on the page */
export async function getTags(apiToken) {
  return manychatFetch(apiToken, '/page/getTags');
}

/** GET /fb/page/getCustomFields — All custom fields */
export async function getCustomFields(apiToken) {
  return manychatFetch(apiToken, '/page/getCustomFields');
}

/** GET /fb/page/getFlows — All automation flows */
export async function getFlows(apiToken) {
  return manychatFetch(apiToken, '/page/getFlows');
}

/** GET /fb/page/getGrowthTools — All growth tools */
export async function getGrowthTools(apiToken) {
  return manychatFetch(apiToken, '/page/getGrowthTools');
}

/** GET /fb/page/getBotFields — All bot fields */
export async function getBotFields(apiToken) {
  return manychatFetch(apiToken, '/page/getBotFields');
}

/** GET /fb/page/getOtnTopics — One-time notification topics */
export async function getOtnTopics(apiToken) {
  return manychatFetch(apiToken, '/page/getOtnTopics');
}

/** POST /fb/page/createTag — Create a new tag */
export async function createTag(apiToken, name) {
  return manychatFetch(apiToken, '/page/createTag', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** POST /fb/page/removeTag — Delete a tag by ID */
export async function removeTag(apiToken, tagId) {
  return manychatFetch(apiToken, '/page/removeTag', {
    method: 'POST',
    body: JSON.stringify({ tag_id: tagId }),
  });
}

/** POST /fb/page/createCustomField — Create a custom field */
export async function createCustomField(apiToken, { name, type, description }) {
  return manychatFetch(apiToken, '/page/createCustomField', {
    method: 'POST',
    body: JSON.stringify({ caption: name, type, description }),
  });
}

/** POST /fb/page/setBotField — Set a bot-level field value */
export async function setBotField(apiToken, { fieldId, fieldValue }) {
  return manychatFetch(apiToken, '/page/setBotField', {
    method: 'POST',
    body: JSON.stringify({ field_id: fieldId, field_value: fieldValue }),
  });
}

/** POST /fb/page/setBotFieldByName — Set a bot-level field by name */
export async function setBotFieldByName(apiToken, { fieldName, fieldValue }) {
  return manychatFetch(apiToken, '/page/setBotFieldByName', {
    method: 'POST',
    body: JSON.stringify({ field_name: fieldName, field_value: fieldValue }),
  });
}

// ─── Subscriber Endpoints ──────────────────────────────────────────────────────

/** GET /fb/subscriber/getInfo — Get subscriber details by ID */
export async function getSubscriberInfo(apiToken, subscriberId) {
  return manychatFetch(apiToken, `/subscriber/getInfo?subscriber_id=${subscriberId}`);
}

/** GET /fb/subscriber/getInfoByRef — Get subscriber by custom ref */
export async function getSubscriberByRef(apiToken, ref) {
  return manychatFetch(apiToken, `/subscriber/getInfoByRef?ref=${encodeURIComponent(ref)}`);
}

/** POST /fb/subscriber/findByName — Search subscribers by name */
export async function findSubscribersByName(apiToken, name) {
  return manychatFetch(apiToken, '/subscriber/findByName', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** POST /fb/subscriber/findBySystemField — Search by system field (email, phone, etc.) */
export async function findBySystemField(apiToken, { fieldName, fieldValue }) {
  return manychatFetch(apiToken, '/subscriber/findBySystemField', {
    method: 'POST',
    body: JSON.stringify({ field_name: fieldName, field_value: fieldValue }),
  });
}

/** POST /fb/subscriber/findByCustomField — Search by custom field */
export async function findByCustomField(apiToken, { fieldId, fieldValue }) {
  return manychatFetch(apiToken, '/subscriber/findByCustomField', {
    method: 'POST',
    body: JSON.stringify({ field_id: fieldId, field_value: fieldValue }),
  });
}

/** POST /fb/subscriber/createSubscriber — Create a new subscriber */
export async function createSubscriber(apiToken, { firstName, lastName, phone, email, gender, hasOptInSms, hasOptInEmail, consentPhrase }) {
  const body = {};
  if (firstName) body.first_name = firstName;
  if (lastName) body.last_name = lastName;
  if (phone) body.phone = phone;
  if (email) body.email = email;
  if (gender) body.gender = gender;
  if (hasOptInSms !== undefined) body.has_opt_in_sms = hasOptInSms;
  if (hasOptInEmail !== undefined) body.has_opt_in_email = hasOptInEmail;
  if (consentPhrase) body.consent_phrase = consentPhrase;
  return manychatFetch(apiToken, '/subscriber/createSubscriber', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST /fb/subscriber/addTag — Add a tag to a subscriber */
export async function addSubscriberTag(apiToken, subscriberId, tagId) {
  return manychatFetch(apiToken, '/subscriber/addTag', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, tag_id: tagId }),
  });
}

/** POST /fb/subscriber/addTagByName — Add a tag by name */
export async function addSubscriberTagByName(apiToken, subscriberId, tagName) {
  return manychatFetch(apiToken, '/subscriber/addTagByName', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, tag_name: tagName }),
  });
}

/** POST /fb/subscriber/removeTag — Remove a tag from a subscriber */
export async function removeSubscriberTag(apiToken, subscriberId, tagId) {
  return manychatFetch(apiToken, '/subscriber/removeTag', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, tag_id: tagId }),
  });
}

/** POST /fb/subscriber/removeTagByName — Remove a tag by name */
export async function removeSubscriberTagByName(apiToken, subscriberId, tagName) {
  return manychatFetch(apiToken, '/subscriber/removeTagByName', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, tag_name: tagName }),
  });
}

/** POST /fb/subscriber/setCustomField — Set a custom field value */
export async function setSubscriberCustomField(apiToken, subscriberId, fieldId, fieldValue) {
  return manychatFetch(apiToken, '/subscriber/setCustomField', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, field_id: fieldId, field_value: fieldValue }),
  });
}

/** POST /fb/subscriber/setCustomFieldByName — Set a custom field by name */
export async function setSubscriberCustomFieldByName(apiToken, subscriberId, fieldName, fieldValue) {
  return manychatFetch(apiToken, '/subscriber/setCustomFieldByName', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, field_name: fieldName, field_value: fieldValue }),
  });
}

// ─── Sending Endpoints ─────────────────────────────────────────────────────────

/** POST /fb/sending/sendContent — Send dynamic message to a subscriber */
export async function sendContent(apiToken, subscriberId, data) {
  return manychatFetch(apiToken, '/sending/sendContent', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, data }),
  });
}

/** POST /fb/sending/sendContentByUserRef — Send to a user ref */
export async function sendContentByUserRef(apiToken, userRef, data) {
  return manychatFetch(apiToken, '/sending/sendContentByUserRef', {
    method: 'POST',
    body: JSON.stringify({ user_ref: userRef, data }),
  });
}

/** POST /fb/sending/sendFlow — Trigger a flow for a subscriber */
export async function sendFlow(apiToken, subscriberId, flowNs) {
  return manychatFetch(apiToken, '/sending/sendFlow', {
    method: 'POST',
    body: JSON.stringify({ subscriber_id: subscriberId, flow_ns: flowNs }),
  });
}

// ─── Sync Helpers ──────────────────────────────────────────────────────────────

/** Sync ManyChat page info and store subscriber count + page details */
export async function syncPageInfo(apiToken, userId = 'default') {
  const result = await getPageInfo(apiToken);
  if (!result.ok) throw new Error(result.error);

  const pageData = result.data;

  // Update connection metadata with latest page info
  const conn = await getStoredConnection(userId);
  if (conn) {
    const updatedMetadata = {
      ...conn.metadata,
      page_name: pageData.name || pageData.page_name,
      subscribers: pageData.subscribers,
      last_synced: new Date().toISOString(),
    };
    await saveConnection(updatedMetadata, userId);
  }

  return pageData;
}

/** Log a sync event */
export async function logSync(userId, action, details = {}) {
  if (!isSupabaseConfigured()) return;
  await supabase.from('manychat_sync_log').insert({
    user_id: userId,
    action,
    details,
    synced_at: new Date().toISOString(),
  });
}
