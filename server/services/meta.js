import { supabase, isSupabaseConfigured } from './supabase.js';

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 'http://localhost:3001/api/auth/meta/callback';
const GRAPH_API = 'https://graph.facebook.com/v22.0';

// Permissions needed for Instagram + Facebook insights
// Note: pages_read_user_content, instagram_basic, and instagram_manage_insights
// require App Review. For development mode, use only default-available scopes.
// Once app is approved, re-enable the full set.
const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  // instagram_basic and instagram_manage_insights require App Review
  // For now, we can still get IG account info via the Page's instagram_business_account field
].join(',');

export function isMetaConfigured() {
  return !!(META_APP_ID && META_APP_SECRET);
}

// Generate the Facebook OAuth consent URL
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

// Exchange authorization code for short-lived token, then get long-lived token
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

// Get user's Facebook Pages (needed to find connected IG account)
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

  const url = `${GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${userAccessToken}`;
  console.log('Fetching pages from:', url.replace(userAccessToken, '[REDACTED]'));
  const res = await fetch(url);
  const data = await res.json();
  console.log('Pages API response status:', res.status, 'data:', JSON.stringify(data).substring(0, 500));
  if (!res.ok) {
    throw new Error(`Failed to get pages: ${data.error?.message}`);
  }
  return data.data || [];
}

// Get Instagram Business Account info
export async function getInstagramAccount(igUserId, pageAccessToken) {
  const res = await fetch(`${GRAPH_API}/${igUserId}?fields=id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count&access_token=${pageAccessToken}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to get IG account: ${err.error?.message}`);
  }
  return res.json();
}

// Fetch Instagram media (posts) with basic metrics
export async function getInstagramMedia(igUserId, pageAccessToken, limit = 50, after = null) {
  let url = `${GRAPH_API}/${igUserId}/media?fields=id,media_type,media_product_type,caption,permalink,timestamp,like_count,comments_count,thumbnail_url&limit=${limit}&access_token=${pageAccessToken}`;
  if (after) url += `&after=${after}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to get IG media: ${err.error?.message}`);
  }
  return res.json();
}

// Fetch insights for a single Instagram media item
export async function getInstagramMediaInsights(mediaId, mediaType, pageAccessToken) {
  // Different metrics available depending on media type
  let metrics;
  if (mediaType === 'REELS' || mediaType === 'VIDEO') {
    metrics = 'impressions,reach,saved,shares,comments,likes,plays';
  } else if (mediaType === 'CAROUSEL_ALBUM') {
    metrics = 'impressions,reach,saved,shares,comments,likes';
  } else {
    // IMAGE / default
    metrics = 'impressions,reach,saved,shares,comments,likes';
  }

  const res = await fetch(`${GRAPH_API}/${mediaId}/insights?metric=${metrics}&access_token=${pageAccessToken}`);
  if (!res.ok) {
    // Some posts may not have insights available (e.g., stories that expired)
    return null;
  }
  const data = await res.json();

  // Convert array of metric objects to a flat object
  const insights = {};
  (data.data || []).forEach(m => {
    insights[m.name] = m.values?.[0]?.value ?? 0;
  });
  return insights;
}

// Fetch Instagram account-level insights
export async function getInstagramAccountInsights(igUserId, pageAccessToken, period = 'day', since = null, until = null) {
  const metrics = 'impressions,reach,accounts_engaged,follows_and_unfollows';
  let url = `${GRAPH_API}/${igUserId}/insights?metric=${metrics}&period=${period}&metric_type=total_value&access_token=${pageAccessToken}`;
  if (since) url += `&since=${since}`;
  if (until) url += `&until=${until}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to get IG account insights: ${err.error?.message}`);
  }
  return res.json();
}

// Fetch Facebook Page posts
export async function getFacebookPosts(pageId, pageAccessToken, limit = 50, after = null) {
  let url = `${GRAPH_API}/${pageId}/posts?fields=id,message,permalink_url,created_time,full_picture&limit=${limit}&access_token=${pageAccessToken}`;
  if (after) url += `&after=${after}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to get FB posts: ${err.error?.message}`);
  }
  return res.json();
}

// Fetch insights for a single Facebook post
export async function getFacebookPostInsights(postId, pageAccessToken) {
  try {
    const metrics = 'post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total';
    const res = await fetch(`${GRAPH_API}/${postId}/insights?metric=${metrics}&access_token=${pageAccessToken}`);
    if (!res.ok) {
      console.warn(`FB post insights failed for ${postId}:`, res.status);
      return null;
    }

    const data = await res.json();
    const insights = {};
    (data.data || []).forEach(m => {
      insights[m.name] = m.values?.[0]?.value ?? 0;
    });
    return insights;
  } catch (err) {
    console.warn(`FB post insights error for ${postId}:`, err.message);
    return null;
  }
}

// Get stored Meta connection from Supabase
export async function getStoredConnection() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', 'meta')
    .single();
  return data;
}

// Get a valid page access token (stored in platform_connections metadata)
export async function getValidPageToken() {
  const conn = await getStoredConnection();
  if (!conn?.is_connected || !conn?.metadata?.page_access_token) {
    throw new Error('Meta is not connected. Please connect your Instagram/Facebook account first.');
  }
  return {
    pageAccessToken: conn.metadata.page_access_token,
    pageId: conn.metadata.page_id,
    igUserId: conn.metadata.ig_user_id,
  };
}

// Save connection to Supabase
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
