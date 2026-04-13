import { supabase, isSupabaseConfigured } from './supabase.js';
import crypto from 'crypto';

// ─── Config ────────────────────────────────────────────────────────────────────
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 'http://localhost:3001/api/auth/meta/callback';
const GRAPH_API = 'https://graph.facebook.com/v22.0';

// ─── Scopes ────────────────────────────────────────────────────────────────────
// Standard Access scopes (available immediately):
const STANDARD_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

// Advanced Access scopes (require App Review approval):
const ADVANCED_SCOPES = [
  'read_insights',
  'instagram_basic',
  'instagram_manage_insights',
  'pages_read_user_content',
];

// Check which scopes to request. In dev mode, only standard scopes work.
// Set META_ADVANCED_ACCESS=true after App Review is approved.
const HAS_ADVANCED_ACCESS = process.env.META_ADVANCED_ACCESS === 'true';
const SCOPES = HAS_ADVANCED_ACCESS
  ? [...STANDARD_SCOPES, ...ADVANCED_SCOPES].join(',')
  : STANDARD_SCOPES.join(',');

// ─── Rate Limit Handling ───────────────────────────────────────────────────────
const RATE_LIMIT_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
};

/**
 * Fetch wrapper with automatic rate limit handling and exponential backoff.
 * Handles Meta API error codes 4 (rate limit), 17 (user-level rate limit),
 * 32 (page-level rate limit), and 613 (custom rate limit).
 */
async function metaFetch(url, options = {}, retries = 0) {
  const res = await fetch(url, options);

  // Check for rate limiting
  if (res.status === 429 || res.headers.get('x-app-usage') || res.headers.get('x-business-use-case-usage')) {
    // Check app usage headers for approaching limits
    const appUsage = parseUsageHeader(res.headers.get('x-app-usage'));
    if (appUsage && (appUsage.call_count > 90 || appUsage.total_cputime > 90 || appUsage.total_time > 90)) {
      const delay = Math.min(
        RATE_LIMIT_CONFIG.baseDelayMs * Math.pow(2, retries),
        RATE_LIMIT_CONFIG.maxDelayMs
      );
      console.warn(`Meta API approaching rate limit (${appUsage.call_count}% calls used), waiting ${delay}ms...`);
      await sleep(delay);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errorCode = body?.error?.code;
    const errorSubcode = body?.error?.error_subcode;

    // Rate limit error codes
    if ([4, 17, 32, 613].includes(errorCode) && retries < RATE_LIMIT_CONFIG.maxRetries) {
      const delay = Math.min(
        RATE_LIMIT_CONFIG.baseDelayMs * Math.pow(2, retries),
        RATE_LIMIT_CONFIG.maxDelayMs
      );
      console.warn(`Meta API rate limited (code ${errorCode}), retry ${retries + 1}/${RATE_LIMIT_CONFIG.maxRetries} in ${delay}ms`);
      await sleep(delay);
      return metaFetch(url, options, retries + 1);
    }

    // Token expired — try refresh if it's an auth error
    if (errorCode === 190) {
      // OAuthException — token expired or invalid
      if (errorSubcode === 463 || errorSubcode === 467) {
        console.warn('Meta API: token expired, attempting refresh...');
        throw new TokenExpiredError(body.error?.message || 'Token expired');
      }
    }

    // Return the error response for caller to handle
    return { ok: false, status: res.status, error: body.error, _raw: res };
  }

  return { ok: true, status: res.status, data: await res.json(), _raw: res };
}

function parseUsageHeader(header) {
  if (!header) return null;
  try { return JSON.parse(header); } catch { return null; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Custom error for token expiration
export class TokenExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

// ─── Core Functions ────────────────────────────────────────────────────────────

export function isMetaConfigured() {
  return !!(META_APP_ID && META_APP_SECRET);
}

export function hasAdvancedAccess() {
  return HAS_ADVANCED_ACCESS;
}

/** Generate the Facebook OAuth consent URL */
export function getAuthUrl(state = '') {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    scope: SCOPES,
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/v22.0/dialog/oauth?${params}`;
}

/** Exchange authorization code for short-lived token, then get long-lived token */
export async function exchangeCode(code) {
  // Step 1: Get short-lived token
  const shortRes = await fetch(`${GRAPH_API}/oauth/access_token?` + new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: META_REDIRECT_URI,
    code,
  }));
  if (!shortRes.ok) {
    const err = await shortRes.json();
    throw new Error(`Meta token exchange failed: ${err.error?.message || JSON.stringify(err)}`);
  }
  const shortData = await shortRes.json();

  // Step 2: Exchange for long-lived token (~60 days)
  const longRes = await fetch(`${GRAPH_API}/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    fb_exchange_token: shortData.access_token,
  }));
  if (!longRes.ok) {
    const err = await longRes.json();
    throw new Error(`Long-lived token exchange failed: ${err.error?.message || JSON.stringify(err)}`);
  }
  const longData = await longRes.json();

  return {
    access_token: longData.access_token,
    token_type: longData.token_type,
    expires_in: longData.expires_in, // ~5184000 seconds (60 days)
  };
}

// ─── Token Refresh ─────────────────────────────────────────────────────────────

/**
 * Refresh the long-lived user token before it expires.
 * Long-lived tokens can be exchanged for a new one within their validity period.
 * Returns null if the token can't be refreshed (user must re-auth).
 */
export async function refreshLongLivedToken(currentToken) {
  try {
    const res = await fetch(`${GRAPH_API}/oauth/access_token?` + new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: currentToken,
    }));

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Token refresh failed:', err.error?.message || res.status);
      return null;
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  } catch (err) {
    console.error('Token refresh error:', err.message);
    return null;
  }
}

/**
 * Check if the stored token is expiring soon (within 7 days) and refresh it.
 * Also refreshes the page access token since it derives from the user token.
 */
export async function checkAndRefreshToken() {
  if (!isSupabaseConfigured()) return null;

  const conn = await getStoredConnection();
  if (!conn?.is_connected || !conn?.metadata?.user_access_token) return null;

  const { metadata } = conn;
  const obtainedAt = new Date(metadata.token_obtained_at).getTime();
  const expiresIn = (metadata.token_expires_in || 5184000) * 1000; // ms
  const expiresAt = obtainedAt + expiresIn;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // If token expires in more than 7 days, no refresh needed
  if (expiresAt - now > sevenDaysMs) {
    return { refreshed: false, expiresAt: new Date(expiresAt).toISOString() };
  }

  console.log('Meta token expiring soon, refreshing...');
  const newToken = await refreshLongLivedToken(metadata.user_access_token);
  if (!newToken) {
    console.warn('Token refresh failed — user will need to re-authenticate');
    // Mark connection as needing re-auth
    await supabase
      .from('platform_connections')
      .update({ metadata: { ...metadata, needs_reauth: true } })
      .eq('platform', 'meta');
    return { refreshed: false, needsReauth: true };
  }

  // Get fresh page token using the new user token
  const pages = await getPages(newToken.access_token);
  const page = pages?.find(p => p.id === metadata.page_id) || pages?.[0];

  if (!page) {
    console.warn('Token refreshed but no pages found');
    return { refreshed: false, error: 'No pages found after refresh' };
  }

  // Update stored connection with new tokens
  const updatedMetadata = {
    ...metadata,
    user_access_token: newToken.access_token,
    token_expires_in: newToken.expires_in,
    token_obtained_at: new Date().toISOString(),
    page_access_token: page.access_token,
    needs_reauth: false,
  };

  await saveConnection(updatedMetadata);
  console.log('Meta token refreshed successfully, new expiry:', newToken.expires_in, 'seconds');

  return {
    refreshed: true,
    expiresAt: new Date(Date.now() + newToken.expires_in * 1000).toISOString(),
  };
}

// ─── Page & Account Fetching ───────────────────────────────────────────────────

/** Get user's Facebook Pages */
export async function getPages(userAccessToken) {
  // Debug: check who the token belongs to and what permissions it has
  try {
    const meRes = await fetch(`${GRAPH_API}/me?fields=id,name&access_token=${userAccessToken}`);
    const meData = await meRes.json();
    console.log('Token belongs to:', JSON.stringify(meData));

    const permsRes = await fetch(`${GRAPH_API}/me/permissions?access_token=${userAccessToken}`);
    const permsData = await permsRes.json();
    console.log('Token permissions:', JSON.stringify(permsData));
  } catch (debugErr) {
    console.warn('Debug queries failed:', debugErr.message);
  }

  const url = `${GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account,fan_count&access_token=${userAccessToken}`;
  console.log('Fetching pages from:', url.replace(userAccessToken, '[REDACTED]'));
  const res = await fetch(url);
  const data = await res.json();
  console.log('Pages API response status:', res.status, 'data:', JSON.stringify(data).substring(0, 500));
  if (!res.ok) {
    throw new Error(`Failed to get pages: ${data.error?.message}`);
  }
  return data.data || [];
}

/** Get Instagram Business Account info */
export async function getInstagramAccount(igUserId, pageAccessToken) {
  const result = await metaFetch(
    `${GRAPH_API}/${igUserId}?fields=id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count&access_token=${pageAccessToken}`
  );
  if (!result.ok) {
    throw new Error(`Failed to get IG account: ${result.error?.message}`);
  }
  return result.data;
}

// ─── Data Fetching (with rate limit handling) ──────────────────────────────────

/** Fetch Instagram media (posts) with basic metrics */
export async function getInstagramMedia(igUserId, pageAccessToken, limit = 25, after = null) {
  const fields = 'id,media_type,media_product_type,caption,permalink,timestamp,like_count,comments_count,thumbnail_url';

  let url = `${GRAPH_API}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`;
  if (after) url += `&after=${after}`;

  const result = await metaFetch(url);
  if (!result.ok) {
    throw new Error(`Failed to get IG media: ${result.error?.message}`);
  }
  return result.data;
}

/** Fetch insights for a single Instagram media item (requires instagram_manage_insights) */
export async function getInstagramMediaInsights(mediaId, mediaType, pageAccessToken) {
  let metrics;
  if (mediaType === 'REELS' || mediaType === 'VIDEO') {
    metrics = 'impressions,reach,saved,shares,comments,likes,plays';
  } else if (mediaType === 'CAROUSEL_ALBUM') {
    metrics = 'impressions,reach,saved,shares,comments,likes';
  } else {
    metrics = 'impressions,reach,saved,shares,comments,likes';
  }

  const result = await metaFetch(
    `${GRAPH_API}/${mediaId}/insights?metric=${metrics}&access_token=${pageAccessToken}`
  );
  if (!result.ok) return null;

  const insights = {};
  (result.data.data || []).forEach(m => {
    insights[m.name] = m.values?.[0]?.value ?? 0;
  });
  return insights;
}

/** Fetch Instagram account-level insights */
export async function getInstagramAccountInsights(igUserId, pageAccessToken, period = 'day', since = null, until = null) {
  const metrics = 'impressions,reach,accounts_engaged,follows_and_unfollows';
  let url = `${GRAPH_API}/${igUserId}/insights?metric=${metrics}&period=${period}&metric_type=total_value&access_token=${pageAccessToken}`;
  if (since) url += `&since=${since}`;
  if (until) url += `&until=${until}`;

  const result = await metaFetch(url);
  if (!result.ok) {
    throw new Error(`Failed to get IG account insights: ${result.error?.message}`);
  }
  return result.data;
}

/** Fetch Facebook Page posts */
export async function getFacebookPosts(pageId, pageAccessToken, limit = 50, after = null) {
  // When we have advanced access with read_insights, we can request more fields
  const fields = 'id,message,permalink_url,created_time,full_picture';
  let url = `${GRAPH_API}/${pageId}/posts?fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`;
  if (after) url += `&after=${after}`;

  const result = await metaFetch(url);
  if (!result.ok) {
    throw new Error(`Failed to get FB posts: ${result.error?.message}`);
  }
  return result.data;
}

/** Fetch insights for a single Facebook post (requires read_insights) */
export async function getFacebookPostInsights(postId, pageAccessToken) {
  try {
    const metrics = 'post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total';
    const result = await metaFetch(
      `${GRAPH_API}/${postId}/insights?metric=${metrics}&access_token=${pageAccessToken}`
    );
    if (!result.ok) {
      console.warn(`FB post insights failed for ${postId}:`, result.error?.message || '');
      return null;
    }

    const insights = {};
    (result.data.data || []).forEach(m => {
      insights[m.name] = m.values?.[0]?.value ?? 0;
    });
    return insights;
  } catch (err) {
    console.warn(`FB post insights error for ${postId}:`, err.message);
    return null;
  }
}

// ─── Incremental Sync Helpers ──────────────────────────────────────────────────

/**
 * Get the timestamp of the most recently synced post for a platform.
 * Used for incremental sync — only fetch posts newer than this.
 */
export async function getLastSyncTimestamp(platform) {
  if (!isSupabaseConfigured()) return null;

  const table = platform === 'instagram' ? 'instagram_insights' : 'facebook_insights';
  const timeCol = platform === 'instagram' ? 'timestamp' : 'created_time';

  const { data, error } = await supabase
    .from(table)
    .select(timeCol)
    .order(timeCol, { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data[timeCol];
}

/** Fetch Facebook posts since a given timestamp (for incremental sync) */
export async function getFacebookPostsSince(pageId, pageAccessToken, since, limit = 50, after = null) {
  const fields = 'id,message,permalink_url,created_time,full_picture';
  const sinceUnix = Math.floor(new Date(since).getTime() / 1000);
  let url = `${GRAPH_API}/${pageId}/posts?fields=${fields}&limit=${limit}&since=${sinceUnix}&access_token=${pageAccessToken}`;
  if (after) url += `&after=${after}`;

  const result = await metaFetch(url);
  if (!result.ok) {
    throw new Error(`Failed to get FB posts since ${since}: ${result.error?.message}`);
  }
  return result.data;
}

/** Fetch Instagram media since a given timestamp (for incremental sync) */
export async function getInstagramMediaSince(igUserId, pageAccessToken, since, limit = 25, after = null) {
  const fields = 'id,media_type,media_product_type,caption,permalink,timestamp,like_count,comments_count,thumbnail_url';

  const sinceUnix = Math.floor(new Date(since).getTime() / 1000);
  let url = `${GRAPH_API}/${igUserId}/media?fields=${fields}&limit=${limit}&since=${sinceUnix}&access_token=${pageAccessToken}`;
  if (after) url += `&after=${after}`;

  const result = await metaFetch(url);
  if (!result.ok) {
    throw new Error(`Failed to get IG media since ${since}: ${result.error?.message}`);
  }
  return result.data;
}

// ─── Data Deletion (required by Meta) ──────────────────────────────────────────

/**
 * Parse the Meta signed request for data deletion callbacks.
 * Meta sends a signed_request POST body when a user deletes their data.
 */
export function parseSignedRequest(signedRequest) {
  const [encodedSig, payload] = signedRequest.split('.');

  const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const data = JSON.parse(
    Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
  );

  // Verify signature
  const expectedSig = crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(payload)
    .digest();

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    throw new Error('Invalid signed request signature');
  }

  return data;
}

/**
 * Handle data deletion request from Meta.
 * Deletes all stored data for the given user and returns a confirmation URL.
 */
export async function handleDataDeletion(userId) {
  if (!isSupabaseConfigured()) return null;

  // Generate a unique confirmation code for this deletion
  const confirmationCode = crypto.randomUUID();

  // Delete all data associated with this Meta user
  const conn = await getStoredConnection();
  if (conn?.metadata?.page_id) {
    // Delete Facebook insights
    await supabase.from('facebook_insights').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Delete Instagram insights
    await supabase.from('instagram_insights').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Delete sync logs
    await supabase.from('meta_sync_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Disconnect the connection
    await supabase
      .from('platform_connections')
      .update({
        is_connected: false,
        access_token: null,
        metadata: { deleted_at: new Date().toISOString(), deletion_code: confirmationCode },
      })
      .eq('platform', 'meta');
  }

  // Log the deletion
  console.log(`Meta data deletion completed for user ${userId}, confirmation: ${confirmationCode}`);

  return { confirmationCode, userId };
}

// ─── Webhook Verification ──────────────────────────────────────────────────────

/** Verify webhook signature from Meta */
export function verifyWebhookSignature(rawBody, signature) {
  if (!signature) return false;
  const expectedSig = crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expectedSig}`),
    Buffer.from(signature)
  );
}

// ─── Connection Management ─────────────────────────────────────────────────────

/** Get stored Meta connection from Supabase */
export async function getStoredConnection() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', 'meta')
    .single();
  return data;
}

/** Get a valid page access token, auto-refreshing if needed */
export async function getValidPageToken() {
  const conn = await getStoredConnection();
  if (!conn?.is_connected || !conn?.metadata?.page_access_token) {
    throw new Error('Meta is not connected. Please connect your Instagram/Facebook account first.');
  }

  // Check if token needs refresh
  const { metadata } = conn;
  if (metadata.needs_reauth) {
    throw new Error('Meta connection needs re-authentication. Please disconnect and reconnect your account.');
  }

  const obtainedAt = new Date(metadata.token_obtained_at).getTime();
  const expiresIn = (metadata.token_expires_in || 5184000) * 1000;
  const expiresAt = obtainedAt + expiresIn;
  const oneDayMs = 24 * 60 * 60 * 1000;

  // If token expires within 1 day, try auto-refresh
  if (expiresAt - Date.now() < oneDayMs) {
    console.log('Token expiring soon, attempting auto-refresh...');
    const refreshResult = await checkAndRefreshToken();
    if (refreshResult?.refreshed) {
      // Re-fetch the connection to get the new token
      const refreshedConn = await getStoredConnection();
      return {
        pageAccessToken: refreshedConn.metadata.page_access_token,
        pageId: refreshedConn.metadata.page_id,
        igUserId: refreshedConn.metadata.ig_user_id,
        userAccessToken: refreshedConn.metadata.user_access_token,
        grantedScopes: refreshedConn.metadata.granted_scopes || [],
      };
    }
  }

  return {
    pageAccessToken: metadata.page_access_token,
    pageId: metadata.page_id,
    igUserId: metadata.ig_user_id,
    userAccessToken: metadata.user_access_token,
    grantedScopes: metadata.granted_scopes || [],
  };
}

/** Save connection to Supabase */
export async function saveConnection(metadata) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('platform_connections')
    .upsert({
      platform: 'meta',
      display_name: 'Instagram & Facebook',
      is_connected: true,
      connected_at: new Date().toISOString(),
      access_token: metadata.user_access_token,
      metadata,
    }, { onConflict: 'platform' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
