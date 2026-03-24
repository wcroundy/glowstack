import { supabase, isSupabaseConfigured } from './supabase.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

// Picker API scope + Library API scope (for fetching items by ID for video upgrades)
const SCOPES = [
  'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  'https://www.googleapis.com/auth/photoslibrary.readonly',
];

const PICKER_API = 'https://photospicker.googleapis.com/v1';

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

// --- Picker API Methods ---

// Create a picker session — returns { id, pickerUri, expireTime, mediaItemsSet }
export async function createSession(accessToken) {
  const res = await fetch(`${PICKER_API}/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error('createSession error:', res.status, errBody);
    throw new Error(`Picker API error: ${res.status} - ${errBody}`);
  }
  return res.json();
}

// Get session status — check if user has finished selecting
export async function getSession(accessToken, sessionId) {
  const res = await fetch(`${PICKER_API}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error('getSession error:', res.status, errBody);
    throw new Error(`Picker API error: ${res.status} - ${errBody}`);
  }
  return res.json();
}

// List media items from a completed session
export async function listSessionMediaItems(accessToken, sessionId, pageToken = null) {
  const params = new URLSearchParams({
    sessionId,
    pageSize: '100',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${PICKER_API}/mediaItems?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error('listSessionMediaItems error:', res.status, errBody);
    throw new Error(`Picker API error: ${res.status} - ${errBody}`);
  }
  return res.json();
}

// Delete a session when done
export async function deleteSession(accessToken, sessionId) {
  try {
    await fetch(`${PICKER_API}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error('deleteSession error (non-critical):', err.message);
  }
}

// --- Library API Methods ---

const LIBRARY_API = 'https://photoslibrary.googleapis.com/v1';

// Fetch a single media item by ID (requires photoslibrary.readonly scope)
export async function getMediaItem(accessToken, mediaItemId) {
  const res = await fetch(`${LIBRARY_API}/mediaItems/${mediaItemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Library API error: ${res.status} - ${errBody}`);
  }
  return res.json();
}

export function isGoogleConfigured() {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}
