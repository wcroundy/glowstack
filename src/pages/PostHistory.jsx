import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Loader2, ExternalLink, Heart, MessageCircle, Share2,
  Bookmark, Eye, TrendingUp, ChevronLeft, ChevronRight, Image as ImageIcon,
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

export default function PostHistory() {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [sort, setSort] = useState('published_at');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Post History</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {total.toLocaleString()} posts archived across Instagram, Facebook & TikTok
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={handleSyncAll} disabled={syncing} className="btn-primary text-sm">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync All Platforms
          </button>
          {syncMessage && <span className="text-[11px] text-surface-400 max-w-xs text-right">{syncMessage}</span>}
        </div>
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
    </div>
  );
}
