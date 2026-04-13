import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Eye, Heart, MessageCircle,
  Sparkles, ArrowRight, Zap, Clock, Target, BarChart3,
  Instagram, Facebook, Share2, Bookmark, Play, MousePointerClick,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

function MetricCard({ title, value, change, prefix = '', suffix = '', icon: Icon, sub }) {
  const isPositive = change == null || change >= 0;
  const formatted = typeof value === 'number'
    ? value >= 1000000 ? `${prefix}${(value / 1000000).toFixed(1)}M${suffix}`
    : value >= 1000 ? `${prefix}${(value / 1000).toFixed(1)}K${suffix}`
    : `${prefix}${value.toLocaleString()}${suffix}`
    : value;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-surface-500">{title}</span>
        {Icon && <Icon className="w-5 h-5 text-surface-300" />}
      </div>
      <div className="text-2xl font-bold text-surface-900 mb-1">{formatted}</div>
      {change != null && (
        <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {isPositive ? '+' : ''}{change}%
          <span className="text-surface-400 font-normal ml-1">vs last period</span>
        </div>
      )}
      {sub && <p className="text-xs text-surface-400 mt-1">{sub}</p>}
    </div>
  );
}

function InsightCard({ insight }) {
  const typeIcons = {
    opportunity: Zap,
    timing: Clock,
    revenue: Sparkles,
    trend: TrendingUp,
    content: Target,
  };
  const Icon = typeIcons[insight.type] || Zap;

  return (
    <div className="rounded-xl p-4 bg-pink-50 dark:bg-green-950/40 border border-pink-200 dark:border-green-800">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-white/80 dark:bg-green-900/50 text-pink-600 dark:text-green-400">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-surface-800 mb-1">{insight.title}</h4>
          <p className="text-xs text-surface-600 leading-relaxed">{insight.description}</p>
          {insight.action && (
            <button className="mt-2 text-xs font-medium text-pink-600 dark:text-green-400 flex items-center gap-1 hover:underline">
              {insight.action} <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [social, setSocial] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    Promise.all([
      api.getSocialOverview().catch(() => null),
      api.getInsights().then(r => r.data || []).catch(() => []),
    ]).then(([socialData, insightsData]) => {
      setSocial(socialData);
      setInsights(insightsData);
    }).finally(() => setLoading(false));
  }, []);

  const ig = social?.instagram;
  const fb = social?.facebook;
  const tk = social?.tiktok;
  const totals = social?.totals;

  // Brand colors: pink in light mode, green in dark mode
  const isDark = theme === 'dark';
  const brandColors = isDark
    ? { primary: '#22c55e', secondary: '#ec4899', tertiary: '#f97316', quaternary: '#16a34a' }
    : { primary: '#ec4899', secondary: '#22c55e', tertiary: '#f97316', quaternary: '#db2777' };

  // Engagement by platform — using real data
  const engagementByPlatform = [];
  if (ig) engagementByPlatform.push({ name: 'Instagram', engagement: ig.engagementRate, fill: brandColors.primary });
  if (fb) engagementByPlatform.push({ name: 'Facebook', engagement: fb.engagementRate, fill: brandColors.secondary });
  if (tk) engagementByPlatform.push({ name: 'TikTok', engagement: tk.engagementRate, fill: brandColors.tertiary });

  // Content mix pie chart
  const contentMix = [];
  if (ig?.posts) contentMix.push({ name: 'Instagram', value: ig.posts, fill: brandColors.primary });
  if (fb?.posts) contentMix.push({ name: 'Facebook', value: fb.posts, fill: brandColors.secondary });
  if (tk?.posts) contentMix.push({ name: 'TikTok', value: tk.posts, fill: brandColors.tertiary });

  // Chart theme colors
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const axisColor = isDark ? '#94a3b8' : '#94a3b8';
  const tooltipStyle = {
    borderRadius: '12px',
    border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
    fontSize: '12px',
    backgroundColor: isDark ? '#1e293b' : '#ffffff',
    color: isDark ? '#f1f5f9' : '#1e293b',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <p className="text-sm text-surface-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const hasData = totals && totals.posts > 0;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Dashboard</h1>
        <p className="text-sm text-surface-500 mt-0.5">
          {hasData
            ? `Tracking ${totals.posts.toLocaleString()} posts across ${engagementByPlatform.length} platform${engagementByPlatform.length !== 1 ? 's' : ''}`
            : 'Connect your social accounts to see live analytics'}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Posts"
          value={totals?.posts || 0}
          icon={BarChart3}
          sub={`${ig?.posts || 0} IG · ${fb?.posts || 0} FB${tk ? ` · ${tk.posts} TK` : ''}`}
        />
        <MetricCard
          title="Total Likes"
          value={totals?.likes || 0}
          icon={Heart}
          sub={`${(ig?.likes || 0).toLocaleString()} IG · ${(fb?.reactions || 0).toLocaleString()} FB`}
        />
        <MetricCard
          title="Total Comments"
          value={totals?.comments || 0}
          icon={MessageCircle}
          sub={`${(ig?.comments || 0).toLocaleString()} IG · ${(fb?.comments || 0).toLocaleString()} FB`}
        />
        <MetricCard
          title="Total Followers"
          value={(ig?.followers || 0) + (fb?.followers || 0)}
          icon={Users}
          sub={`${(ig?.followers || 0).toLocaleString()} IG · ${(fb?.followers || 0).toLocaleString()} FB`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Engagement by Platform */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Avg Engagement per Post by Platform</h3>
          {engagementByPlatform.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={engagementByPlatform}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} stroke={gridColor} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} stroke={gridColor} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v.toLocaleString()} avg interactions`} />
                <Bar dataKey="engagement" radius={[8, 8, 0, 0]} name="Avg Engagement">
                  {engagementByPlatform.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-surface-400">
              No platform data yet
            </div>
          )}
        </div>

        {/* Content Mix */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Content Mix by Platform</h3>
          {contentMix.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={contentMix} cx="50%" cy="50%" outerRadius={60} innerRadius={35} dataKey="value" paddingAngle={4}>
                    {contentMix.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v.toLocaleString()} posts`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {contentMix.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                      <span className="text-surface-600">{s.name}</span>
                    </div>
                    <span className="font-medium text-surface-800">{s.value.toLocaleString()} posts</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-surface-400">
              No platform data yet
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Insights + Recent IG + Recent FB */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI Insights */}
        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-surface-800">AI Insights</h3>
          </div>
          <div className="space-y-3">
            {insights.length > 0 ? (
              insights.slice(0, 4).map(ins => (
                <InsightCard key={ins.id} insight={ins} />
              ))
            ) : (
              <p className="text-sm text-surface-400">Insights will appear as more data is collected.</p>
            )}
          </div>
        </div>

        {/* Recent Instagram Posts */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Instagram className="w-4 h-4 text-pink-500" />
            <h3 className="text-sm font-semibold text-surface-800">Recent Instagram Posts</h3>
          </div>
          <div className="space-y-3">
            {(ig?.recentPosts || []).slice(0, 6).map(post => (
              <div key={post.ig_media_id} className="flex items-center gap-3">
                {post.thumbnail_url && (
                  <img src={post.thumbnail_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-surface-800 truncate">
                    {post.caption ? post.caption.slice(0, 50) + (post.caption.length > 50 ? '...' : '') : '(no caption)'}
                  </p>
                  <p className="text-[11px] text-surface-400">
                    {(post.like_count || 0).toLocaleString()} likes · {(post.comments_count || 0).toLocaleString()} comments
                  </p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-500 shrink-0">
                  {post.media_type === 'VIDEO' ? 'Reel' : post.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Photo'}
                </span>
              </div>
            ))}
            {(!ig?.recentPosts || ig.recentPosts.length === 0) && (
              <p className="text-sm text-surface-400">No recent Instagram posts. Sync in Social Insights.</p>
            )}
          </div>
        </div>

        {/* Recent Facebook Posts */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Facebook className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-surface-800">Recent Facebook Posts</h3>
          </div>
          <div className="space-y-3">
            {(fb?.recentPosts || []).slice(0, 6).map(post => (
              <div key={post.fb_post_id} className="flex items-center gap-3">
                {post.full_picture && (
                  <img src={post.full_picture} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-surface-800 truncate">
                    {post.message ? post.message.slice(0, 50) + (post.message.length > 50 ? '...' : '') : '(no text)'}
                  </p>
                  <p className="text-[11px] text-surface-400">
                    {(post.reactions_total || 0).toLocaleString()} reactions · {(post.comments_count || 0).toLocaleString()} comments
                  </p>
                </div>
              </div>
            ))}
            {(!fb?.recentPosts || fb.recentPosts.length === 0) && (
              <p className="text-sm text-surface-400">No recent Facebook posts. Sync in Social Insights.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
