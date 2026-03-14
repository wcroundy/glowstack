import { supabase, isSupabaseConfigured } from './supabase.js';
import crypto from 'crypto';

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3001/api/auth/tiktok/callback';
const TIKTOK_API = 'https://open.tiktokapis.com/v2';

// Scopes for creator analytics
const SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';

export function isTikTokConfigured() {
  return !!(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET);
}

// Generate the TikTok OAuth authorization URL
export function getAuthUrl() {
  // TikTok uses CSRF state param
  const csrfState = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: TIKTOK_REDIRECT_URI,
    state: csrfState,
  });
  return {
    url: `https://www.tiktok.com/v2/auth/authorize/?${params}`,
    state: csrfState,
  };
}

// Exchange authorization code for access token
export async function exchangeCode(code) {
  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: TIKTOK_REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TikTok token exchange failed: ${err}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`TikTok token error: ${data.error_description || data.error}`);
  }
  return data;
}

// Refresh an expired access token
export async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${TIKTOK_API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error('TikTok token refresh failed');
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`TikTok refresh error: ${data.error_description || data.error}`);
  }
  return data;
}

// Get user info
export async function getUserInfo(accessToken) {
  const res = await fetch(`${TIKTOK_API}/user/info/?fields=open_id,union_id,avatar_url,avatar_url_100,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get TikTok user info: ${err}`);
  }

  const data = await res.json();
  if (data.error?.code !== 'ok' && data.error?.code) {
    throw new Error(`TikTok user info error: ${data.error?.message || JSON.stringify(data.error)}`);
  }
  return data.data?.user || data.data;
}

// List user's videos with pagination
export async function getUserVideos(accessToken, cursor = null, maxCount = 20) {
  const body = {
    max_count: maxCount,
  };
  if (cursor) body.cursor = cursor;

  const res = await fetch(`${TIKTOK_API}/video/list/?fields=id,title,video_description,duration,cover_image_url,share_url,create_time,like_count,comment_count,share_count,view_count`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get TikTok videos: ${err}`);
  }

  const data = await res.json();
  if (data.error?.code !== 'ok' && data.error?.code) {
    throw new Error(`TikTok video list error: ${data.error?.message || JSON.stringify(data.error)}`);
  }
  return data.data || {};
}

// Get stored TikTok connection from Supabase
export async function getStoredConnection() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', 'tiktok')
    .single();
  return data;
}

// Get a valid access token (refresh if expired)
export async function getValidToken() {
  const conn = await getStoredConnection();
  if (!conn?.is_connected || !conn?.metadata?.access_token) {
    throw new Error('TikTok is not connected. Please connect your TikTok account first.');
  }

  const { access_token, refresh_token, token_expires_at } = conn.metadata;

  // Check if token is expired (with 5 min buffer)
  const expiresAt = new Date(token_expires_at);
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000 && refresh_token) {
    try {
      const refreshed = await refreshAccessToken(refresh_token);
      const newMeta = {
        ...conn.metadata,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || refresh_token,
        token_expires_at: new Date(Date.now() + (refreshed.expires_in || 86400) * 1000).toISOString(),
      };
      await supabase
        .from('platform_connections')
        .update({ metadata: newMeta, access_token: refreshed.access_token })
        .eq('platform', 'tiktok');
      return refreshed.access_token;
    } catch (err) {
      console.error('TikTok token refresh failed:', err.message);
      // Try the old token anyway
    }
  }

  return access_token;
}

// Save connection to Supabase
export async function saveConnection(metadata) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('platform_connections')
    .upsert({
      platform: 'tiktok',
      display_name: 'TikTok',
      is_connected: true,
      connected_at: new Date().toISOString(),
      access_token: metadata.access_token,
      refresh_token: metadata.refresh_token,
      metadata,
    }, { onConflict: 'platform' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
