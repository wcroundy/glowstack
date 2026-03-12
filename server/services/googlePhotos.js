import { supabase, isSupabaseConfigured } from './supabase.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/photoslibrary.readonly',
  'https://www.googleapis.com/auth/photoslibrary.sharing',
];

// Generate the Google OAuth consent URL
export function getAuthUrl(state = '') {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Exchange authorization code for tokens
export async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Token exchange failed: ${err.error_description || err.error}`);
  }
  return res.json();
}

// Refresh an expired access token
export async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Token refresh failed: ${err.error_description || err.error}`);
  }
  return res.json();
}

// Get a valid access token (refreshes if needed)
export async function getValidToken() {
  if (!isSupabaseConfigured()) return null;

  const { data: connection } = await supabase
    .from('platform_connections')
    .select('*')
    .eq('platform', 'google_photos')
    .single();

  if (!connection || !connection.is_connected) return null;

  const meta = connection.metadata || {};
  const accessToken = meta.access_token;
  const refreshToken = meta.refresh_token;
  const expiresAt = meta.expires_at;

  // Check if token is still valid (with 5 min buffer)
  if (accessToken && expiresAt && Date.now() < expiresAt - 300000) {
    return accessToken;
  }

  // Refresh the token
  if (!refreshToken) throw new Error('No refresh token available. Please reconnect Google Photos.');

  console.log('Refreshing Google Photos access token...');
  const tokens = await refreshAccessToken(refreshToken);
  console.log('Token refreshed successfully');

  // Update stored tokens
  const updatedMeta = {
    ...meta,
    access_token: tokens.access_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  };
  if (tokens.refresh_token) {
    updatedMeta.refresh_token = tokens.refresh_token;
  }

  await supabase
    .from('platform_connections')
    .update({ metadata: updatedMeta })
    .eq('platform', 'google_photos');

  return tokens.access_token;
}

// Google Photos API helpers
const PHOTOS_API = 'https://photoslibrary.googleapis.com/v1';

// List albums
export async function listAlbums(accessToken, pageToken = null) {
  const params = new URLSearchParams({ pageSize: '50' });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${PHOTOS_API}/albums?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error('listAlbums error response:', res.status, errBody);
    throw new Error(`Photos API error: ${res.status} - ${errBody}`);
  }
  return res.json();
}

// List media items (optionally filtered by album)
export async function listMediaItems(accessToken, { albumId, pageSize = 25, pageToken = null, filters = null } = {}) {
  if (albumId) {
    // Search within album
    const body = {
      albumId,
      pageSize,
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(`${PHOTOS_API}/mediaItems:search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Photos API error: ${res.status}`);
    return res.json();
  }

  // List all media items
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${PHOTOS_API}/mediaItems?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Photos API error: ${res.status}`);
  return res.json();
}

// Get a single media item
export async function getMediaItem(accessToken, mediaItemId) {
  const res = await fetch(`${PHOTOS_API}/mediaItems/${mediaItemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Photos API error: ${res.status}`);
  return res.json();
}

// Search media items by date or content
export async function searchMediaItems(accessToken, { dateRange, contentCategories, pageSize = 25, pageToken = null } = {}) {
  const body = { pageSize };
  if (pageToken) body.pageToken = pageToken;

  const filters = {};
  if (dateRange) {
    filters.dateFilter = {
      ranges: [{
        startDate: dateRange.start,
        endDate: dateRange.end,
      }],
    };
  }
  if (contentCategories) {
    filters.contentFilter = {
      includedContentCategories: contentCategories,
    };
  }
  if (Object.keys(filters).length > 0) {
    body.filters = filters;
  }

  const res = await fetch(`${PHOTOS_API}/mediaItems:search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Photos API error: ${res.status}`);
  return res.json();
}

export function isGoogleConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}
