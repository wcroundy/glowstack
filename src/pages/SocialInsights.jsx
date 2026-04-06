import React, { useState, useEffect } from 'react';
import {
  Instagram, Facebook, Link2, Unlink, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Heart, MessageCircle, Eye, Bookmark, Share2, TrendingUp,
  BarChart3, Clock, ExternalLink, Play, Image as ImageIcon, Layers,
  ArrowUpRight, ArrowDownRight, MousePointerClick, Music2, Timer,
} from 'lucide-react';
import { api } from '../services/api';

function StatCard({ label, value, icon: Icon, color = 'brand', sub }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-600',
    pink: 'bg-pink-50 text-pink-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-surface-500 font-medium">{label}</p>
          <p className="text-lg font-bold text-surface-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {sub && <p className="text-xs text-surface-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function PostRow({ post, platform }) {
  const isIg = platform === 'instagram';
  const caption = isIg ? post.caption : post.message;
  const date = new Date(isIg ? post.timestamp : post.created_time);
  const link = isIg ? post.permalink : post.permalink_url;

  return (
    <tr className="hover:bg-surface-50/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {(isIg ? post.thumbnail_url : post.full_picture) && (
            <img
              src={isIg ? post.thumbnail_url : post.full_picture}
              alt=""
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-surface-800 truncate max-w-xs">
              {caption ? caption.slice(0, 80) + (caption.length > 80 ? '...' : '') : '(no caption)'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-surface-400">
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              {isIg && post.media_type && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  post.media_type === 'VIDEO' || post.media_type === 'REELS'
                    ? 'bg-purple-50 text-purple-600'
                    : post.media_type === 'CAROUSEL_ALBUM'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-surface-100 text-surface-500'
                }`}>
                  {post.media_product_type === 'REELS' ? 'Reel' : post.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : post.media_type === 'VIDEO' ? 'Video' : 'Photo'}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">{(isIg ? post.impressions : post.impressions)?.toLocaleString() || '—'}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">{(post.reach)?.toLocaleString() || '—'}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">{(isIg ? post.like_count : post.reactions_total)?.toLocaleString() || '—'}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">{(post.comments_count)?.toLocaleString() || '—'}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums">
        {isIg ? (post.saved?.toLocaleString() || '—') : (post.clicks?.toLocaleString() || '—')}
      </td>
      <td className="px-4 py-3 text-right">
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:text-brand-600">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </td>
    </tr>
  );
}

export default function SocialInsights() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active tab
  const [activeTab, setActiveTab] = useState('instagram');

  // Instagram data
  const [igSummary, setIgSummary] = useState(null);
  const [igPosts, setIgPosts] = useState([]);
  const [igTotal, setIgTotal] = useState(0);

  // Facebook data
  const [fbSummary, setFbSummary] = useState(null);
  const [fbPosts, setFbPosts] = useState([]);
  const [fbTotal, setFbTotal] = useState(0);

  // TikTok data
  const [tiktokStatus, setTiktokStatus] = useState(null);
  const [tkSummary, setTkSummary] = useState(null);
  const [tkVideos, setTkVideos] = useState([]);
  const [tkTotal, setTkTotal] = useState(0);

  // Sync state
  const [syncing, setSyncing] = useState(null); // 'instagram' | 'facebook' | 'tiktok' | 'both' | null
  const [syncResult, setSyncResult] = useState(null);

  // Sort
  const [sortField, setSortField] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination
  const PAGE_SIZE = 50;
  const [igPage, setIgPage] = useState(0);
  const [fbPage, setFbPage] = useState(0);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const [metaS, tkS] = await Promise.all([
        api.metaStatus().catch(() => ({ configured: false, connected: false })),
        api.tiktokStatus().catch(() => ({ configured: false, connected: false })),
      ]);
      setStatus(metaS);
      setTiktokStatus(tkS);
      // Set default active tab based on what's connected
      if (!metaS.connected && tkS.connected) {
        setActiveTab('tiktok');
      }
      if (metaS.connected || tkS.connected) {
        loadData(metaS.connected, tkS.connected);
      }
    } catch (err) {
      setError('Failed to check connection status');
    } finally {
      setLoading(false);
    }
  };

  const loadData = async (metaConnected, tkConnected) => {
    const metaConn = metaConnected ?? status?.connected;
    const tkConn = tkConnected ?? tiktokStatus?.connected;
    try {
      const promises = [];
      if (metaConn) {
        promises.push(
          api.metaInstagramSummary().catch(() => null),
          api.metaInstagramPosts({ limit: PAGE_SIZE, offset: igPage * PAGE_SIZE, sort: sortField, order: sortOrder }).catch(() => ({ data: [], total: 0 })),
          api.metaFacebookSummary().catch(() => null),
          api.metaFacebookPosts({ limit: PAGE_SIZE, offset: fbPage * PAGE_SIZE }).catch(() => ({ data: [], total: 0 })),
        );
      } else {
        promises.push(null, { data: [], total: 0 }, null, { data: [], total: 0 });
      }
      if (tkConn) {
        promises.push(
          api.tiktokSummary().catch(() => null),
          api.tiktokVideos({ limit: 50 }).catch(() => ({ data: [], total: 0 })),
        );
      } else {
        promises.push(null, { data: [], total: 0 });
      }

      const [igS, igP, fbS, fbP, tkS, tkV] = await Promise.all(promises);
      setIgSummary(igS);
      setIgPosts(igP?.data || []);
      setIgTotal(igP?.total || 0);
      setFbSummary(fbS);
      setFbPosts(fbP?.data || []);
      setFbTotal(fbP?.total || 0);
      setTkSummary(tkS);
      setTkVideos(tkV?.data || []);
      setTkTotal(tkV?.total || 0);
    } catch (err) {
      // non-critical
    }
  };

  // Pagination handlers
  const loadFbPage = async (page) => {
    setFbPage(page);
    try {
      const result = await api.metaFacebookPosts({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setFbPosts(result?.data || []);
      setFbTotal(result?.total || 0);
    } catch (err) { /* non-critical */ }
  };

  const loadIgPage = async (page) => {
    setIgPage(page);
    try {
      const result = await api.metaInstagramPosts({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, sort: sortField, order: sortOrder });
      setIgPosts(result?.data || []);
      setIgTotal(result?.total || 0);
    } catch (err) { /* non-critical */ }
  };

  const handleConnect = async () => {
    try {
      const { url } = await api.metaAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError('Failed to get authorization URL');
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.metaDisconnect();
      setStatus({ ...status, connected: false, instagram: null, facebook: null });
      setIgSummary(null);
      setIgPosts([]);
      setFbSummary(null);
      setFbPosts([]);
    } catch (err) {
      setError('Failed to disconnect');
    }
  };

  const handleSync = async (platform) => {
    setSyncing(platform);
    setSyncResult(null);
    setError('');
    try {
      let result;
      if (platform === 'all') {
        const promises = [];
        if (status?.connected) {
          promises.push(api.metaSyncInstagram(), api.metaSyncFacebook());
        }
        if (tiktokStatus?.connected) {
          promises.push(api.tiktokSync());
        }
        const results = await Promise.all(promises);
        const parts = [];
        let i = 0;
        if (status?.connected) {
          parts.push(`${results[i]?.synced || 0} IG posts`, `${results[i + 1]?.synced || 0} FB posts`);
          i += 2;
        }
        if (tiktokStatus?.connected) {
          parts.push(`${results[i]?.synced || 0} TikTok videos`);
        }
        result = { message: `Synced ${parts.join(', ')}` };
      } else if (platform === 'instagram') {
        result = await api.metaSyncInstagram();
      } else if (platform === 'facebook') {
        result = await api.metaSyncFacebook();
      } else if (platform === 'tiktok') {
        result = await api.tiktokSync();
      }
      setSyncResult(result);
      loadData();
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(null);
    }
  };

  // Check URL params for connection result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_connected') === 'true') {
      loadStatus();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('meta_error')) {
      setError(`Meta connection failed: ${params.get('meta_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('tiktok_connected') === 'true') {
      loadStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('tiktok_error')) {
      setError(`TikTok connection failed: ${params.get('tiktok_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        <span className="ml-2 text-sm text-surface-500">Loading...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-brand-500" />
            Social Insights
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Instagram, Facebook & TikTok post performance analytics
          </p>
        </div>
        {(status?.connected || tiktokStatus?.connected) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSync('all')}
              disabled={!!syncing}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {syncing ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Syncing {syncing}...</>
              ) : (
                <><RefreshCw className="w-4 h-4" /> Sync All</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Sync Result */}
      {syncResult && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {syncResult.message}
          <button onClick={() => setSyncResult(null)} className="ml-auto text-green-400 hover:text-green-600">×</button>
        </div>
      )}

      {/* Not Connected — show only when NEITHER Meta nor TikTok is connected */}
      {!status?.connected && !tiktokStatus?.connected && (
        <div className="card p-8 text-center space-y-4">
          {!status?.configured && !tiktokStatus?.configured ? (
            <>
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
              <h2 className="text-lg font-semibold text-surface-800">Social APIs Not Configured</h2>
              <p className="text-sm text-surface-500 max-w-md mx-auto">
                Add your Meta or TikTok API credentials to environment variables to enable social insights.
                Visit the Integrations page to get started.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-500 flex items-center justify-center">
                  <Instagram className="w-7 h-7 text-white" />
                </div>
                <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center">
                  <Facebook className="w-7 h-7 text-white" />
                </div>
                <div className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center">
                  <Music2 className="w-7 h-7 text-white" />
                </div>
              </div>
              <h2 className="text-lg font-semibold text-surface-800">Connect Your Social Accounts</h2>
              <p className="text-sm text-surface-500 max-w-md mx-auto">
                Connect Instagram, Facebook, and TikTok to pull in post performance data,
                engagement metrics, and audience insights.
              </p>
              {status?.configured && (
                <button
                  onClick={handleConnect}
                  className="btn-primary text-sm inline-flex items-center gap-2"
                >
                  <Link2 className="w-4 h-4" />
                  Connect with Facebook
                </button>
              )}
              <p className="text-xs text-surface-400">
                Visit the Integrations page to connect your accounts.
              </p>
            </>
          )}
        </div>
      )}

      {/* Connected — show when at least one platform is connected */}
      {(status?.connected || tiktokStatus?.connected) && (
        <>
          {/* Connection Info */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              {status?.connected && (
                <>
                  {status.instagram?.profilePicture && (
                    <img src={status.instagram.profilePicture} alt="" className="w-12 h-12 rounded-full" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <Instagram className="w-4 h-4 text-pink-500" />
                      <span className="font-semibold text-surface-800">
                        @{status.instagram?.username || 'Connected'}
                      </span>
                      {status.instagram?.followers && (
                        <span className="text-xs text-surface-400">{status.instagram.followers.toLocaleString()} followers</span>
                      )}
                    </div>
                    {status.facebook?.pageName && (
                      <div className="flex items-center gap-2 mt-1">
                        <Facebook className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-surface-600">{status.facebook.pageName}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
              {tiktokStatus?.connected && (
                <div className={`flex items-center gap-2 ${status?.connected ? 'ml-4 pl-4 border-l' : ''}`}>
                  {tiktokStatus.account?.avatar && (
                    <img src={tiktokStatus.account.avatar} alt="" className="w-10 h-10 rounded-full" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <Music2 className="w-4 h-4 text-surface-900" />
                      <span className="font-semibold text-surface-800">
                        {tiktokStatus.account?.displayName || tiktokStatus.account?.username || 'TikTok Connected'}
                      </span>
                      {tiktokStatus.account?.followers != null && (
                        <span className="text-xs text-surface-400">{tiktokStatus.account.followers.toLocaleString()} followers</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-xl p-1 w-fit">
            {status?.connected && (
              <>
                <button
                  onClick={() => setActiveTab('instagram')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'instagram'
                      ? 'bg-white shadow-sm text-surface-900'
                      : 'text-surface-500 hover:text-surface-700'
                  }`}
                >
                  <Instagram className="w-4 h-4" />
                  Instagram
                  {igTotal > 0 && <span className="text-xs text-surface-400">({igTotal})</span>}
                </button>
                <button
                  onClick={() => setActiveTab('facebook')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'facebook'
                      ? 'bg-white shadow-sm text-surface-900'
                      : 'text-surface-500 hover:text-surface-700'
                  }`}
                >
                  <Facebook className="w-4 h-4" />
                  Facebook
                  {fbTotal > 0 && <span className="text-xs text-surface-400">({fbTotal})</span>}
                </button>
              </>
            )}
            {tiktokStatus?.connected && (
              <button
                onClick={() => setActiveTab('tiktok')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'tiktok'
                    ? 'bg-white shadow-sm text-surface-900'
                    : 'text-surface-500 hover:text-surface-700'
                }`}
              >
                <Music2 className="w-4 h-4" />
                TikTok
                {tkTotal > 0 && <span className="text-xs text-surface-400">({tkTotal})</span>}
              </button>
            )}
          </div>

          {/* Instagram Tab */}
          {activeTab === 'instagram' && (
            <div className="space-y-6">
              {/* Summary Stats */}
              {igSummary && igSummary.totalPosts > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-surface-500">{igSummary.totalPosts.toLocaleString()} posts synced</p>
                    <button
                      onClick={() => handleSync('instagram')}
                      disabled={!!syncing}
                      className="btn-ghost text-sm flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing === 'instagram' ? 'animate-spin' : ''}`} />
                      {syncing === 'instagram' ? 'Syncing...' : 'Re-sync Instagram'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Total Posts" value={igSummary.totalPosts} icon={ImageIcon} color="brand" />
                    <StatCard label="Total Reach" value={igSummary.totalReach} icon={Eye} color="blue" />
                    <StatCard label="Total Likes" value={igSummary.totalLikes} icon={Heart} color="pink" />
                    <StatCard label="Avg Engagement" value={`${igSummary.avgEngagementRate}%`} icon={TrendingUp} color="green" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Comments" value={igSummary.totalComments} icon={MessageCircle} color="amber" />
                    <StatCard label="Saves" value={igSummary.totalSaved} icon={Bookmark} color="purple" />
                    <StatCard label="Shares" value={igSummary.totalShares} icon={Share2} color="indigo" />
                    <StatCard label="Video Plays" value={igSummary.totalPlays} icon={Play} color="red" />
                  </div>

                  {/* Content type breakdown */}
                  {igSummary.byType && Object.keys(igSummary.byType).length > 1 && (
                    <div className="card p-4">
                      <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        Performance by Content Type
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {Object.entries(igSummary.byType).map(([type, data]) => (
                          <div key={type} className="bg-surface-50 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-surface-600 uppercase">
                                {type === 'CAROUSEL_ALBUM' ? 'Carousel' : type === 'IMAGE' ? 'Photo' : type}
                              </span>
                              <span className="text-xs text-surface-400">{data.count} posts</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-surface-500">
                              <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {data.likes.toLocaleString()}</span>
                              <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {data.comments.toLocaleString()}</span>
                              <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {data.reach.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-surface-400 mt-1">
                              Avg engagement: {data.count > 0 ? Math.round(data.engagement / data.count).toLocaleString() : 0}/post
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Posts Table */}
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-surface-700">Instagram Posts</h3>
                      <button
                        onClick={() => handleSync('instagram')}
                        disabled={!!syncing}
                        className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncing === 'instagram' ? 'animate-spin' : ''}`} />
                        {syncing === 'instagram' ? 'Syncing...' : 'Refresh'}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-50 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                            <th className="px-4 py-2.5">Post</th>
                            <th className="px-4 py-2.5 text-right">Impressions</th>
                            <th className="px-4 py-2.5 text-right">Reach</th>
                            <th className="px-4 py-2.5 text-right">Likes</th>
                            <th className="px-4 py-2.5 text-right">Comments</th>
                            <th className="px-4 py-2.5 text-right">Saves</th>
                            <th className="px-4 py-2.5 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100">
                          {igPosts.map(post => (
                            <PostRow key={post.id} post={post} platform="instagram" />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    {igTotal > PAGE_SIZE && (
                      <div className="px-4 py-3 border-t flex items-center justify-between">
                        <p className="text-xs text-surface-400">
                          Showing {igPage * PAGE_SIZE + 1}–{Math.min((igPage + 1) * PAGE_SIZE, igTotal)} of {igTotal.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => loadIgPage(igPage - 1)}
                            disabled={igPage === 0}
                            className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-xs text-surface-500">
                            Page {igPage + 1} of {Math.ceil(igTotal / PAGE_SIZE)}
                          </span>
                          <button
                            onClick={() => loadIgPage(igPage + 1)}
                            disabled={(igPage + 1) * PAGE_SIZE >= igTotal}
                            className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="card p-8 text-center space-y-3">
                  <Instagram className="w-10 h-10 text-surface-300 mx-auto" />
                  <h3 className="font-semibold text-surface-700">No Instagram Data Yet</h3>
                  <p className="text-sm text-surface-400">Click "Sync All" to pull in your Instagram post data and insights.</p>
                  <button
                    onClick={() => handleSync('instagram')}
                    disabled={!!syncing}
                    className="btn-primary text-sm inline-flex items-center gap-2"
                  >
                    {syncing === 'instagram' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Syncing...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" /> Sync Instagram</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Facebook Tab */}
          {activeTab === 'facebook' && (
            <div className="space-y-6">
              {fbSummary && fbSummary.totalPosts > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-surface-500">{fbSummary.totalPosts.toLocaleString()} posts synced</p>
                    <button
                      onClick={() => handleSync('facebook')}
                      disabled={!!syncing}
                      className="btn-ghost text-sm flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing === 'facebook' ? 'animate-spin' : ''}`} />
                      {syncing === 'facebook' ? 'Syncing...' : 'Re-sync Facebook'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Total Posts" value={fbSummary.totalPosts} icon={ImageIcon} color="brand" />
                    <StatCard label="Total Reach" value={fbSummary.totalReach} icon={Eye} color="blue" />
                    <StatCard label="Reactions" value={fbSummary.totalReactions} icon={Heart} color="pink" />
                    <StatCard label="Total Clicks" value={fbSummary.totalClicks} icon={MousePointerClick} color="green" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <StatCard label="Impressions" value={fbSummary.totalImpressions} icon={Eye} color="amber" />
                    <StatCard label="Shares" value={fbSummary.totalShares} icon={Share2} color="purple" />
                    <StatCard label="Comments" value={fbSummary.totalComments} icon={MessageCircle} color="indigo" />
                  </div>

                  {/* Posts Table */}
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-surface-700">Facebook Posts</h3>
                      <button
                        onClick={() => handleSync('facebook')}
                        disabled={!!syncing}
                        className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncing === 'facebook' ? 'animate-spin' : ''}`} />
                        {syncing === 'facebook' ? 'Syncing...' : 'Refresh'}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-50 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                            <th className="px-4 py-2.5">Post</th>
                            <th className="px-4 py-2.5 text-right">Impressions</th>
                            <th className="px-4 py-2.5 text-right">Reach</th>
                            <th className="px-4 py-2.5 text-right">Reactions</th>
                            <th className="px-4 py-2.5 text-right">Comments</th>
                            <th className="px-4 py-2.5 text-right">Clicks</th>
                            <th className="px-4 py-2.5 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100">
                          {fbPosts.map(post => (
                            <PostRow key={post.id} post={post} platform="facebook" />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    {fbTotal > PAGE_SIZE && (
                      <div className="px-4 py-3 border-t flex items-center justify-between">
                        <p className="text-xs text-surface-400">
                          Showing {fbPage * PAGE_SIZE + 1}–{Math.min((fbPage + 1) * PAGE_SIZE, fbTotal)} of {fbTotal.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => loadFbPage(fbPage - 1)}
                            disabled={fbPage === 0}
                            className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-xs text-surface-500">
                            Page {fbPage + 1} of {Math.ceil(fbTotal / PAGE_SIZE)}
                          </span>
                          <button
                            onClick={() => loadFbPage(fbPage + 1)}
                            disabled={(fbPage + 1) * PAGE_SIZE >= fbTotal}
                            className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 hover:bg-surface-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="card p-8 text-center space-y-3">
                  <Facebook className="w-10 h-10 text-surface-300 mx-auto" />
                  <h3 className="font-semibold text-surface-700">No Facebook Data Yet</h3>
                  <p className="text-sm text-surface-400">Click "Sync All" to pull in your Facebook Page post data and insights.</p>
                  <button
                    onClick={() => handleSync('facebook')}
                    disabled={!!syncing}
                    className="btn-primary text-sm inline-flex items-center gap-2"
                  >
                    {syncing === 'facebook' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Syncing...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" /> Sync Facebook</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TikTok Tab */}
          {activeTab === 'tiktok' && (
            <div className="space-y-6">
              {tkSummary && tkSummary.totalVideos > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Total Videos" value={tkSummary.totalVideos} icon={Play} color="brand" />
                    <StatCard label="Total Views" value={tkSummary.totalViews} icon={Eye} color="blue" />
                    <StatCard label="Total Likes" value={tkSummary.totalLikes} icon={Heart} color="pink" />
                    <StatCard label="Avg Engagement" value={`${tkSummary.avgEngagement}%`} icon={TrendingUp} color="green" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label="Comments" value={tkSummary.totalComments} icon={MessageCircle} color="amber" />
                    <StatCard label="Shares" value={tkSummary.totalShares} icon={Share2} color="purple" />
                    <StatCard label="Avg Views" value={tkSummary.avgViews} icon={BarChart3} color="indigo" />
                    <StatCard
                      label="Total Duration"
                      value={tkSummary.totalDuration > 3600
                        ? `${Math.floor(tkSummary.totalDuration / 3600)}h ${Math.floor((tkSummary.totalDuration % 3600) / 60)}m`
                        : `${Math.floor(tkSummary.totalDuration / 60)}m ${tkSummary.totalDuration % 60}s`}
                      icon={Timer}
                      color="red"
                    />
                  </div>

                  {/* Videos Table */}
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-surface-700">TikTok Videos</h3>
                      <button
                        onClick={() => handleSync('tiktok')}
                        disabled={!!syncing}
                        className="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncing === 'tiktok' ? 'animate-spin' : ''}`} />
                        {syncing === 'tiktok' ? 'Syncing...' : 'Refresh'}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-surface-50 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                            <th className="px-4 py-2.5">Video</th>
                            <th className="px-4 py-2.5 text-right">Views</th>
                            <th className="px-4 py-2.5 text-right">Likes</th>
                            <th className="px-4 py-2.5 text-right">Comments</th>
                            <th className="px-4 py-2.5 text-right">Shares</th>
                            <th className="px-4 py-2.5 text-right">Duration</th>
                            <th className="px-4 py-2.5 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100">
                          {tkVideos.map(video => (
                            <tr key={video.id} className="hover:bg-surface-50/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {video.cover_image_url && (
                                    <img
                                      src={video.cover_image_url}
                                      alt=""
                                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-surface-800 truncate max-w-xs">
                                      {video.title || video.description?.slice(0, 80) || '(no title)'}
                                    </p>
                                    <span className="text-xs text-surface-400">
                                      {video.create_time
                                        ? new Date(video.create_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                        : ''}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums">{(video.view_count || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums">{(video.like_count || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums">{(video.comment_count || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums">{(video.share_count || 0).toLocaleString()}</td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums">{video.duration ? `${video.duration}s` : '—'}</td>
                              <td className="px-4 py-3 text-right">
                                {video.share_url && (
                                  <a href={video.share_url} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:text-brand-600">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="card p-8 text-center space-y-3">
                  <Music2 className="w-10 h-10 text-surface-300 mx-auto" />
                  <h3 className="font-semibold text-surface-700">No TikTok Data Yet</h3>
                  <p className="text-sm text-surface-400">Click "Sync All" or the button below to pull in your TikTok video data.</p>
                  <button
                    onClick={() => handleSync('tiktok')}
                    disabled={!!syncing}
                    className="btn-primary text-sm inline-flex items-center gap-2"
                  >
                    {syncing === 'tiktok' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Syncing...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4" /> Sync TikTok</>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
