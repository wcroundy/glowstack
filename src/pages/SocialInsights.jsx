import React, { useState, useEffect } from 'react';
import {
  Instagram, Facebook, Link2, Unlink, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Heart, MessageCircle, Eye, Bookmark, Share2, TrendingUp,
  BarChart3, Clock, ExternalLink, Play, Image as ImageIcon, Layers,
  ArrowUpRight, ArrowDownRight, MousePointerClick,
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

  // Sync state
  const [syncing, setSyncing] = useState(null); // 'instagram' | 'facebook' | 'both' | null
  const [syncResult, setSyncResult] = useState(null);

  // Sort
  const [sortField, setSortField] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const s = await api.metaStatus();
      setStatus(s);
      if (s.connected) {
        loadData();
      }
    } catch (err) {
      setError('Failed to check Meta connection status');
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [igS, igP, fbS, fbP] = await Promise.all([
        api.metaInstagramSummary().catch(() => null),
        api.metaInstagramPosts({ limit: 50, sort: sortField, order: sortOrder }).catch(() => ({ data: [], total: 0 })),
        api.metaFacebookSummary().catch(() => null),
        api.metaFacebookPosts({ limit: 50 }).catch(() => ({ data: [], total: 0 })),
      ]);
      setIgSummary(igS);
      setIgPosts(igP.data || []);
      setIgTotal(igP.total || 0);
      setFbSummary(fbS);
      setFbPosts(fbP.data || []);
      setFbTotal(fbP.total || 0);
    } catch (err) {
      // non-critical
    }
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
      if (platform === 'both') {
        const [igRes, fbRes] = await Promise.all([
          api.metaSyncInstagram(),
          api.metaSyncFacebook(),
        ]);
        result = {
          message: `Synced ${igRes.synced} Instagram posts and ${fbRes.synced} Facebook posts`,
        };
      } else if (platform === 'instagram') {
        result = await api.metaSyncInstagram();
      } else {
        result = await api.metaSyncFacebook();
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
            Instagram & Facebook post performance analytics
          </p>
        </div>
        {status?.connected && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSync('both')}
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

      {/* Not Connected */}
      {!status?.connected && (
        <div className="card p-8 text-center space-y-4">
          {!status?.configured ? (
            <>
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
              <h2 className="text-lg font-semibold text-surface-800">Meta API Not Configured</h2>
              <p className="text-sm text-surface-500 max-w-md mx-auto">
                Add <code className="bg-surface-100 px-1.5 py-0.5 rounded text-xs">META_APP_ID</code> and{' '}
                <code className="bg-surface-100 px-1.5 py-0.5 rounded text-xs">META_APP_SECRET</code> to your
                environment variables to enable the Instagram & Facebook integration.
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
              </div>
              <h2 className="text-lg font-semibold text-surface-800">Connect Instagram & Facebook</h2>
              <p className="text-sm text-surface-500 max-w-md mx-auto">
                Connect your Instagram Business account and Facebook Page to pull in post performance data,
                engagement metrics, and audience insights.
              </p>
              <button
                onClick={handleConnect}
                className="btn-primary text-sm inline-flex items-center gap-2"
              >
                <Link2 className="w-4 h-4" />
                Connect with Facebook
              </button>
              <p className="text-xs text-surface-400">
                This will ask you to log into Facebook and grant access to your Page and Instagram insights.
              </p>
            </>
          )}
        </div>
      )}

      {/* Connected */}
      {status?.connected && (
        <>
          {/* Connection Info */}
          <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
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
            </div>
            <button
              onClick={handleDisconnect}
              className="btn-ghost text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-xl p-1 w-fit">
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
          </div>

          {/* Instagram Tab */}
          {activeTab === 'instagram' && (
            <div className="space-y-6">
              {/* Summary Stats */}
              {igSummary && igSummary.totalPosts > 0 ? (
                <>
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
        </>
      )}
    </div>
  );
}
