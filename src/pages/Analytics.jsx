import React, { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, Eye, Heart, DollarSign, Users,
  Share2, Bookmark, MousePointer, Clock, ArrowUpRight, FileText
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { api } from '../services/api';
import PlatformIcon, { PlatformBadge } from '../components/common/PlatformIcon';

const PLATFORMS = ['all', 'instagram', 'tiktok', 'youtube', 'pinterest'];

function StatRow({ icon: Icon, label, value, subValue }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-surface-400" />
        <span className="text-sm text-surface-600">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-sm font-semibold text-surface-800">{value}</span>
        {subValue && <span className="text-xs text-surface-400 ml-1.5">{subValue}</span>}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [platform, setPlatform] = useState('all');
  const [overview, setOverview] = useState(null);
  const [posts, setPosts] = useState([]);
  const [bestTimes, setBestTimes] = useState(null);
  const [platformData, setPlatformData] = useState([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.getAnalyticsOverview({ platform }).then(setOverview);
    api.getPostAnalytics({ platform, sort: 'engagement_rate' }).then(r => setPosts(r.data || []));
    api.getBestTimes().then(setBestTimes);
  }, [platform]);

  useEffect(() => {
    const p = platform === 'all' ? 'instagram' : platform;
    api.getPlatformAnalytics(p).then(r => setPlatformData(r.data || []));
  }, [platform]);

  const chartData = platformData.slice(-14).map(d => ({
    date: d.date.slice(5),
    reach: Math.round(d.total_reach / 1000),
    impressions: Math.round(d.total_impressions / 1000),
    followers: d.followers,
  }));

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      await api.generateReport({ report_type: 'weekly', platforms: [platform] });
      alert('Report generated! Check the Reports section.');
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const fmt = (n) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n?.toString();

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Analytics</h1>
          <p className="text-sm text-surface-500 mt-0.5">Deep dive into your performance across platforms</p>
        </div>
        <button onClick={handleGenerateReport} disabled={generating} className="btn-primary text-sm">
          <FileText className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Platform Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors
              ${platform === p ? 'bg-brand-500 text-white' : 'bg-white text-surface-600 border border-surface-200 hover:bg-surface-50'}`}
          >
            {p !== 'all' && <PlatformIcon platform={p} size="sm" />}
            {p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Reach & Impressions Chart */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-surface-800 mb-4">Reach & Impressions (14d)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="reachGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ec4899" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="impGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit="K" />
            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
            <Area type="monotone" dataKey="reach" stroke="#ec4899" fill="url(#reachGrad)" strokeWidth={2} name="Reach (K)" />
            <Area type="monotone" dataKey="impressions" stroke="#a78bfa" fill="url(#impGrad)" strokeWidth={2} name="Impressions (K)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Posts */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Top Performing Posts</h3>
          <div className="space-y-3">
            {posts.slice(0, 6).map((post, i) => (
              <div key={post.id} className="flex items-center gap-3 py-2 border-b border-surface-100 last:border-0">
                <span className="text-xs font-bold text-surface-300 w-5">#{i + 1}</span>
                <PlatformIcon platform={post.platform} size="sm" />
                {post.media?.thumbnail_url && (
                  <img src={post.media.thumbnail_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{post.caption?.slice(0, 60)}</p>
                  <div className="flex gap-3 mt-0.5 text-[11px] text-surface-400">
                    <span><Eye className="w-3 h-3 inline mr-0.5" />{fmt(post.reach)}</span>
                    <span><Heart className="w-3 h-3 inline mr-0.5" />{fmt(post.likes)}</span>
                    <span>{post.engagement_rate}% eng</span>
                  </div>
                </div>
                {post.revenue > 0 && (
                  <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">${post.revenue.toLocaleString()}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Best Times + Quick Stats */}
        <div className="space-y-4">
          {/* Best Posting Times */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-brand-500" />
              <h3 className="text-sm font-semibold text-surface-800">Best Posting Times</h3>
            </div>
            {bestTimes && (platform === 'all' ? ['instagram', 'tiktok', 'youtube', 'pinterest'] : [platform]).map(p => (
              <div key={p} className="flex items-center gap-3 py-2 border-b border-surface-100 last:border-0">
                <PlatformIcon platform={p} size="sm" />
                <div>
                  <p className="text-xs font-medium">{bestTimes[p]?.best_days?.join(', ')}</p>
                  <p className="text-[11px] text-surface-400">
                    {bestTimes[p]?.best_hours?.map(h => `${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`).join(', ')} {bestTimes[p]?.timezone}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-surface-800 mb-2">Quick Stats</h3>
            <div className="divide-y divide-surface-100">
              <StatRow icon={Users} label="Followers" value={fmt(overview?.total_followers)} />
              <StatRow icon={Eye} label="Weekly Reach" value={fmt(overview?.weekly_reach)} />
              <StatRow icon={Heart} label="Avg Engagement" value={`${overview?.avg_engagement_rate}%`} />
              <StatRow icon={DollarSign} label="Revenue (30d)" value={`$${overview?.total_revenue_30d?.toLocaleString()}`} />
              <StatRow icon={BarChart3} label="Posts (30d)" value={overview?.total_posts_30d} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
