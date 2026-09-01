import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Loader2, ExternalLink, Heart, MessageCircle, Share2,
  Bookmark, Eye, TrendingUp, ChevronLeft, ChevronRight, Image as ImageIcon,
  Plus, Users, Trash2, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';
import PlatformIcon from '../components/common/PlatformIcon';

const PAGE_SIZE = 24;

const PLATFORM_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
];

const SORT_OPTIONS = [
  { value: 'published_at', label: 'Newest' },
  { value: 'engagement_rate', label: 'Most Engaged' },
  { value: 'likes', label: 'Most Liked' },
  { value: 'views', label: 'Most Viewed' },
];

function Stat({ icon: Icon, value }) {
  if (value === null || value === undefined) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-surface-500">
      <Icon className="w-3.5 h-3.5" />
      {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString()}
    </span>
  );
}

function PostCard({ post }) {
  return (
    <a
      href={post.post_url || undefined}
      target="_blank"
      rel="noreferrer"
      className={`card-hover group overflow-hidden flex flex-col ${!post.post_url ? 'pointer-events-none' : ''}`}
    >
      <div className="relative aspect-square bg-surface-100 overflow-hidden">
        {post.thumbnail_url ? (
          <img
            src={post.thumbnail_url}
            alt={post.caption || 'Post thumbnail'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-surface-300">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <PlatformIcon platform={post.platform} size="sm" />
        </div>
        {post.engagement_rate > 0 && (
          <div className="absolute top-2 right-2 badge bg-black/70 text-white text-[10px]">
            <TrendingUp className="w-3 h-3 mr-0.5" />
            {post.engagement_rate.toFixed(1)}%
          </div>
        )}
        {post.post_url && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <ExternalLink className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <p className="text-xs text-surface-700 line-clamp-2 min-h-[2rem]">
          {post.caption || <span className="text-surface-300 italic">No caption</span>}
        </p>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-auto pt-1 border-t border-surface-100">
          <Stat icon={Heart} value={post.likes} />
          <Stat icon={MessageCircle} value={post.comments} />
          {post.platform === 'tiktok' || post.platform === 'instagram' ? <Stat icon={Eye} value={post.views} /> : null}
          {post.saves > 0 && <Stat icon={Bookmark} value={post.saves} />}
          {post.shares > 0 && <Stat icon={Share2} value={post.shares} />}
        </div>
        <p className="text-[10px] text-surface-400">
          {post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
        </p>
      </div>
    </a>
  );
}

function WatchedPostCard({ post }) {
  return (
    <a
      href={post.post_url || undefined}
      target="_blank"
      rel="noreferrer"
      className={`card-hover group overflow-hidden flex flex-col ${!post.post_url ? 'pointer-events-none' : ''}`}
    >
      <div className="relative aspect-square bg-surface-100 overflow-hidden">
        {post.thumbnail_url ? (
          <img
            src={post.thumbnail_url}
            alt={post.caption || 'Post thumbnail'}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-surface-300">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
        {post.post_url && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <ExternalLink className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <p className="text-xs text-surface-700 line-clamp-2 min-h-[2rem]">
          {post.caption || <span className="text-surface-300 italic">No caption</span>}
        </p>
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-auto pt-1 border-t border-surface-100">
          <Stat icon={Heart} value={post.likes} />
          <Stat icon={MessageCircle} value={post.comments} />
        </div>
        <p className="text-[10px] text-surface-400">
          {post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
        </p>
      </div>
    </a>
  );
}

function InfluencerCard({ influencer, onSync, onRemove, expanded, onToggleExpand, syncingId }) {
  const syncing = syncingId === influencer.id;
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    if (expanded && posts === null) {
      api.getWatchedInfluencerPosts(influencer.id).then((r) => setPosts(r.data || []));
    }
  }, [expanded, influencer.id, posts]);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        {influencer.profile_picture_url ? (
          <img src={influencer.profile_picture_url} alt={influencer.username} className="w-11 h-11 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-surface-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-surface-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-surface-900 truncate">{influencer.display_name || influencer.username}</p>
            <PlatformIcon platform="instagram" size="sm" />
          </div>
          <p className="text-xs text-surface-500">
            @{influencer.username} · {(influencer.followers_count || 0).toLocaleString()} followers · {influencer.post_count} posts tracked
          </p>
          {influencer.notes && <p className="text-[11px] text-surface-400 mt-0.5 italic">{influencer.notes}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onSync(influencer.id)} disabled={syncing} className="btn-ghost text-xs p-2" title="Sync now">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button onClick={() => onRemove(influencer.id)} className="btn-ghost text-xs p-2 text-red-500 hover:bg-red-50" title="Remove">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => onToggleExpand(influencer.id)} className="btn-ghost text-xs p-2" title="View posts">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-4">
          {posts === null ? (
            <div className="flex justify-center py-6 text-surface-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : posts.length === 0 ? (
            <p className="text-xs text-surface-400 text-center py-4">No posts synced yet — hit sync above.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {posts.map((p) => <WatchedPostCard key={p.id} post={p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WatchlistTab() {
  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [syncingId, setSyncingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.getWatchedInfluencers().then((r) => setInfluencers(r.data || [])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!username.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.addWatchedInfluencer(username.trim(), notes.trim());
      setUsername('');
      setNotes('');
      load();
    } catch (err) {
      setError(err.data?.error || err.message || 'Could not add that account.');
    } finally {
      setAdding(false);
    }
  };

  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      await api.syncWatchedInfluencer(id);
      load();
    } catch (err) {
      console.error('Watchlist sync error:', err);
    } finally {
      setSyncingId(null);
    }
  };

  const handleRemove = async (id) => {
    if (!window.confirm('Remove this account from your watchlist?')) return;
    await api.deleteWatchedInfluencer(id);
    load();
  };

  return (
    <div>
      <div className="card p-4 mb-6">
        <p className="text-sm font-medium text-surface-700 mb-1">Track another creator</p>
        <p className="text-xs text-surface-500 mb-3">
          Works for Instagram Business/Creator accounts — no permission needed from them, just their @handle.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input text-sm flex-1"
            placeholder="@username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="input text-sm flex-1"
            placeholder="Notes (optional) — why you're watching them"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button onClick={handleAdd} disabled={adding || !username.trim()} className="btn-primary text-sm shrink-0">
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-surface-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : influencers.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <p className="text-sm text-surface-500">No creators tracked yet — add one above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {influencers.map((inf) => (
            <InfluencerCard
              key={inf.id}
              influencer={inf}
              syncingId={syncingId}
              onSync={handleSync}
              onRemove={handleRemove}
              expanded={expandedId === inf.id}
              onToggleExpand={(id) => setExpandedId((e) => (e === id ? null : id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostHistory() {
  const [activeTab, setActiveTab] = useState('mine'); // 'mine' | 'watchlist'
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [sort, setSort] = useState('published_at');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncLog, setSyncLog] = useState([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchSyncLog = useCallback(() => {
    api.metaSyncLog().then((r) => setSyncLog(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchSyncLog(); }, [fetchSyncLog]);

  // Most recent log entry per platform (syncLog is already newest-first)
  const lastSyncByPlatform = {};
  for (const entry of syncLog) {
    if (!lastSyncByPlatform[entry.platform]) lastSyncByPlatform[entry.platform] = entry;
  }

  const formatSyncTime = (entry) => {
    if (!entry) return 'Never synced';
    const d = new Date(entry.completed_at || entry.started_at);
    const label = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    if (entry.status === 'failed') return `${label} (failed)`;
    if (entry.status === 'running') return `${label} (in progress)`;
    return label;
  };

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;
    const params = { platform, sort, limit: PAGE_SIZE, offset };
    if (search) params.search = search;
    api.getPosts(params)
      .then((r) => { setPosts(r.data || []); setTotal(r.total || 0); })
      .finally(() => setLoading(false));
  }, [platform, sort, search, page]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { setPage(1); }, [platform, sort, search]);

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncMessage('');
    const results = [];
    for (const [label, fn] of [
      ['Instagram', () => api.metaSyncInstagram()],
      ['Facebook', () => api.metaSyncFacebook()],
      ['TikTok', () => api.tiktokSync()],
    ]) {
      try {
        const r = await fn();
        results.push(`${label}: ${r.synced ?? 0} synced`);
      } catch (err) {
        results.push(`${label}: ${err.data?.error || 'skipped'}`);
      }
    }
    setSyncMessage(results.join(' · '));
    setSyncing(false);
    fetchPosts();
    fetchSyncLog();
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Post History</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {activeTab === 'mine'
              ? `${total.toLocaleString()} posts archived across Instagram, Facebook & TikTok`
              : 'Track other creators\' posts and engagement alongside your own'}
          </p>
        </div>
        {activeTab === 'mine' && (
          <div className="flex flex-col items-end gap-1">
            <button onClick={handleSyncAll} disabled={syncing} className="btn-primary text-sm">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sync All Platforms
            </button>
            {syncMessage && <span className="text-[11px] text-surface-400 max-w-xs text-right">{syncMessage}</span>}
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-surface-100 rounded-xl p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveTab('mine')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'mine' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
          }`}
        >
          My Posts
        </button>
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'watchlist' ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Watchlist
        </button>
      </div>

      {activeTab === 'watchlist' ? (
        <WatchlistTab />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs">
            <span className="font-medium text-surface-500">Last synced:</span>
            {['instagram', 'facebook', 'tiktok'].map((p) => (
              <span key={p} className="flex items-center gap-1.5 text-surface-400">
                <PlatformIcon platform={p} size="sm" />
                {formatSyncTime(lastSyncByPlatform[p])}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input pl-9 text-sm"
                placeholder="Search captions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1 bg-surface-100 rounded-xl p-1">
              {PLATFORM_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setPlatform(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    platform === f.value ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <select className="input text-sm w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-surface-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="card p-12 text-center">
              <ImageIcon className="w-10 h-10 text-surface-300 mx-auto mb-3" />
              <p className="text-sm text-surface-500 mb-1">No posts archived yet.</p>
              <p className="text-xs text-surface-400">
                Connect Instagram/Facebook and TikTok in Integrations, then hit "Sync All Platforms" above.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-ghost text-sm p-2 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-surface-500">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-ghost text-sm p-2 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
