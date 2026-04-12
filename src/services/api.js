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
  deleteMediaBulk: (ids) => request('/media/bulk/delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  uploadMedia: (data) => request('/media/upload', { method: 'POST', body: JSON.stringify(data) }),
  uploadMediaFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    // Don't set Content-Type — browser sets it with boundary for multipart
    const res = await fetch(`${API_BASE}/media/upload-file`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      let errorData;
      try { errorData = await res.json(); } catch (_) {}
      throw new Error(errorData?.message || errorData?.error || `Upload failed: ${res.status}`);
    }
    return res.json();
  },
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
  getSocialOverview: () => request('/dashboard/social-overview'),

  // AI
  aiTagMedia: (mediaId) => request('/ai/tag-media', { method: 'POST', body: JSON.stringify({ media_id: mediaId }) }),
  aiGenerateCaptions: (mediaId, platform) => request('/ai/generate-captions', { method: 'POST', body: JSON.stringify({ media_id: mediaId, platform }) }),
  aiSuggestPostTime: (platform) => request('/ai/suggest-posting-time', { method: 'POST', body: JSON.stringify({ platform }) }),
  aiContentIdeas: () => request('/ai/content-ideas', { method: 'POST', body: JSON.stringify({}) }),

  // Tags
  getTags: (params) => request(`/tags?${new URLSearchParams(params || {})}`),
  createTag: (data) => request('/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id, data) => request(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // Tag Categories
  getTagCategories: () => request('/tags/categories'),
  createTagCategory: (data) => request('/tags/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateTagCategory: (id, data) => request(`/tags/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTagCategory: (id) => request(`/tags/categories/${id}`, { method: 'DELETE' }),

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
  metaRefreshToken: () => request('/meta/refresh-token', { method: 'POST' }),
  metaSyncInstagram: (type) => request(`/meta/sync/instagram?type=${type || 'auto'}`, { method: 'POST' }),
  metaSyncFacebook: (type) => request(`/meta/sync/facebook?type=${type || 'auto'}`, { method: 'POST' }),
  metaInstagramPosts: (params) => request(`/meta/instagram/posts?${new URLSearchParams(params || {})}`),
  metaInstagramSummary: () => request('/meta/instagram/summary'),
  metaFacebookPosts: (params) => request(`/meta/facebook/posts?${new URLSearchParams(params || {})}`),
  metaFacebookSummary: () => request('/meta/facebook/summary'),
  metaSyncLog: () => request('/meta/sync-log'),

  // TikTok
  tiktokStatus: () => request('/tiktok/status'),
  tiktokAuthUrl: () => request('/tiktok/auth-url'),
  tiktokDisconnect: () => request('/tiktok/disconnect', { method: 'POST' }),
  tiktokSync: () => request('/tiktok/sync', { method: 'POST' }),
  tiktokVideos: (params) => request(`/tiktok/videos?${new URLSearchParams(params || {})}`),
  tiktokSummary: () => request('/tiktok/summary'),

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
  googlePhotosRetryVideo: (assetId, baseUrl) => request('/google-photos/retry-video', { method: 'POST', body: JSON.stringify({ assetId, baseUrl }) }),
  googlePhotosImportThumbnailOnly: (items) => request('/google-photos/import-thumbnail-only', { method: 'POST', body: JSON.stringify({ items }) }),
  googlePhotosCleanup: () => request('/google-photos/cleanup', { method: 'POST' }),
  googlePhotosDisconnect: () => request('/google-photos/disconnect', { method: 'POST' }),

  // Video Breakdown
  // SSE-based: streams progress events, resolves with final result
  videoBreakdownExtractAndProcess: (assetId, { baseUrl, videoUrl } = {}, onProgress) => {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      fetch(`${API_BASE}/video-breakdown/extract-and-process`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ assetId, baseUrl, videoUrl }),
      }).then(async (res) => {
        // If not SSE (error response), handle as JSON
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/event-stream')) {
          let errorData;
          try { errorData = await res.json(); } catch (_) {}
          return reject(new Error(errorData?.error || `API error: ${res.status}`));
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === 'progress' && onProgress) {
                  onProgress(event.percent, event.stage);
                } else if (event.type === 'done') {
                  resolve(event);
                } else if (event.type === 'error') {
                  reject(new Error(event.error));
                }
              } catch (_) {}
            }
          }
        }
      }).catch(reject);
    });
  },
  videoBreakdownEstimate: (assetId) => request('/video-breakdown/estimate', { method: 'POST', body: JSON.stringify({ assetId }) }),
  videoBreakdownProcess: (assetId, frames) => request('/video-breakdown/process', { method: 'POST', body: JSON.stringify({ assetId, frames }) }),
  videoBreakdownFrames: (assetId) => request(`/video-breakdown/frames/${assetId}`),
  videoBreakdownRuns: () => request('/video-breakdown/runs'),
  videoBreakdownReset: (assetId) => request(`/video-breakdown/reset/${assetId}`, { method: 'DELETE' }),
  videoBreakdownResetAll: () => request('/video-breakdown/reset-all', { method: 'DELETE' }),
};
