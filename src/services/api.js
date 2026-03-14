const API_BASE = '/api';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { headers, ...options });

  // If we get a 401, clear auth and reload to show login
  if (res.status === 401 && !path.includes('/auth/')) {
    localStorage.removeItem('glowstack_token');
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    // Try to parse error body for structured error info
    let errorData;
    try { errorData = await res.json(); } catch (_) {}
    const err = new Error(errorData?.message || `API error: ${res.status}`);
    err.status = res.status;
    err.code = errorData?.error;
    err.data = errorData;
    throw err;
  }
  return res.json();
}

export const api = {
  // Media
  getMedia: (params) => request(`/media?${new URLSearchParams(params)}`),
  getMediaCounts: () => request('/media/counts'),
  getMediaById: (id) => request(`/media/${id}`),
  uploadMedia: (data) => request('/media/upload', { method: 'POST', body: JSON.stringify(data) }),
  tagMedia: (id, tagId) => request(`/media/${id}/tag`, { method: 'POST', body: JSON.stringify({ tag_id: tagId }) }),
  toggleFavorite: (id) => request(`/media/${id}/favorite`, { method: 'POST' }),

  // Analytics
  getAnalyticsOverview: (params) => request(`/analytics/overview?${new URLSearchParams(params || {})}`),
  getPlatformAnalytics: (platform) => request(`/analytics/platform/${platform}`),
  getPostAnalytics: (params) => request(`/analytics/posts?${new URLSearchParams(params || {})}`),
  getBestTimes: () => request('/analytics/best-times'),
  getContentPerformance: () => request('/analytics/content-performance'),

  // Posts
  getPosts: (params) => request(`/posts?${new URLSearchParams(params || {})}`),
  getPost: (id) => request(`/posts/${id}`),
  createPost: (data) => request('/posts', { method: 'POST', body: JSON.stringify(data) }),

  // Calendar
  getCalendarEvents: (params) => request(`/calendar?${new URLSearchParams(params || {})}`),
  createCalendarEvent: (data) => request('/calendar', { method: 'POST', body: JSON.stringify(data) }),
  updateCalendarEvent: (id, data) => request(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Chat
  getChatMessages: () => request('/chat/messages'),
  sendChatMessage: (message) => request('/chat/send', { method: 'POST', body: JSON.stringify({ message }) }),

  // Platforms
  getPlatforms: () => request('/platforms'),
  getPlatformSetupGuide: (platform) => request(`/platforms/${platform}/setup-guide`),
  connectPlatform: (platform, data) => request(`/platforms/${platform}/connect`, { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard
  getDashboardWidgets: () => request('/dashboard/widgets'),
  getInsights: () => request('/dashboard/insights'),

  // AI
  aiTagMedia: (mediaId) => request('/ai/tag-media', { method: 'POST', body: JSON.stringify({ media_id: mediaId }) }),
  aiGenerateCaptions: (mediaId, platform) => request('/ai/generate-captions', { method: 'POST', body: JSON.stringify({ media_id: mediaId, platform }) }),
  aiSuggestPostTime: (platform) => request('/ai/suggest-posting-time', { method: 'POST', body: JSON.stringify({ platform }) }),
  aiContentIdeas: () => request('/ai/content-ideas', { method: 'POST', body: JSON.stringify({}) }),

  // Tags
  getTags: (params) => request(`/tags?${new URLSearchParams(params || {})}`),
  createTag: (data) => request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // AI Auto-Tag
  aiAutoTag: ({ assetIds, untaggedOnly, limit, offset } = {}) => request('/ai/auto-tag', { method: 'POST', body: JSON.stringify({ assetIds, untaggedOnly, limit, offset }) }),
  aiAcceptSuggestedTags: (tags) => request('/ai/accept-suggested-tags', { method: 'POST', body: JSON.stringify({ tags }) }),

  // Auto-Tag Run History
  getAutoTagRuns: (limit) => request(`/tags/auto-tag-runs?${new URLSearchParams({ limit: limit || 20 })}`),
  createAutoTagRun: (scope) => request('/tags/auto-tag-runs', { method: 'POST', body: JSON.stringify({ scope }) }),
  updateAutoTagRun: (id, data) => request(`/tags/auto-tag-runs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Meta (Instagram + Facebook)
  metaStatus: () => request('/meta/status'),
  metaAuthUrl: () => request('/meta/auth-url'),
  metaDisconnect: () => request('/meta/disconnect', { method: 'POST' }),
  metaSyncInstagram: () => request('/meta/sync/instagram', { method: 'POST' }),
  metaSyncFacebook: () => request('/meta/sync/facebook', { method: 'POST' }),
  metaInstagramPosts: (params) => request(`/meta/instagram/posts?${new URLSearchParams(params || {})}`),
  metaInstagramSummary: () => request('/meta/instagram/summary'),
  metaFacebookPosts: (params) => request(`/meta/facebook/posts?${new URLSearchParams(params || {})}`),
  metaFacebookSummary: () => request('/meta/facebook/summary'),
  metaSyncLog: () => request('/meta/sync-log'),

  // Reports
  generateReport: (data) => request('/reports/generate', { method: 'POST', body: JSON.stringify(data) }),

  // Google Photos (Picker API)
  googlePhotosStatus: () => request('/google-photos/status'),
  googlePhotosAuthUrl: () => request('/google-photos/auth-url'),
  googlePhotosCreateSession: () => request('/google-photos/session', { method: 'POST' }),
  googlePhotosGetSession: (sessionId) => request(`/google-photos/session/${sessionId}`),
  googlePhotosSessionMedia: (sessionId, pageToken) => request(`/google-photos/session/${sessionId}/media?${new URLSearchParams(pageToken ? { pageToken } : {})}`),
  googlePhotosCheckDuplicates: (googleIds) => request('/google-photos/check-duplicates', { method: 'POST', body: JSON.stringify({ googleIds }) }),
  googlePhotosImport: (items) => request('/google-photos/import', { method: 'POST', body: JSON.stringify({ items }) }),
  googlePhotosDeleteSession: (sessionId) => request(`/google-photos/session/${sessionId}`, { method: 'DELETE' }),
  googlePhotosCleanup: () => request('/google-photos/cleanup', { method: 'POST' }),
  googlePhotosDisconnect: () => request('/google-photos/disconnect', { method: 'POST' }),
};
