import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Eye, Heart, DollarSign,
  Sparkles, ArrowRight, ExternalLink, Zap, Clock, Target, BarChart3
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '../services/api';
import PlatformIcon from '../components/common/PlatformIcon';

function MetricCard({ title, value, change, prefix = '', suffix = '', icon: Icon }) {
  const isPositive = change >= 0;
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
      <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
        {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        {isPositive ? '+' : ''}{change}%
        <span className="text-surface-400 font-normal ml-1">vs last period</span>
      </div>
    </div>
  );
}

function InsightCard({ insight }) {
  const typeStyles = {
    opportunity: { bg: 'bg-brand-50', border: 'border-brand-200', icon: Zap, color: 'text-brand-600' },
    timing: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Clock, color: 'text-blue-600' },
    revenue: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: DollarSign, color: 'text-emerald-600' },
    trend: { bg: 'bg-amber-50', border: 'border-amber-200', icon: TrendingUp, color: 'text-amber-600' },
    content: { bg: 'bg-purple-50', border: 'border-purple-200', icon: Target, color: 'text-purple-600' },
  };
  const style = typeStyles[insight.type] || typeStyles.opportunity;
  const Icon = style.icon;

  return (
    <div className={`rounded-xl p-4 ${style.bg} border ${style.border}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-white/80 ${style.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-surface-800 mb-1">{insight.title}</h4>
          <p className="text-xs text-surface-600 leading-relaxed">{insight.description}</p>
          {insight.action && (
            <button className={`mt-2 text-xs font-medium ${style.color} flex items-center gap-1 hover:underline`}>
              {insight.action} <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [insights, setInsights] = useState([]);
  const [posts, setPosts] = useState([]);
  const [platformData, setPlatformData] = useState([]);

  useEffect(() => {
    api.getAnalyticsOverview().then(setOverview);
    api.getInsights().then(r => setInsights(r.data || []));
    api.getPosts({ limit: 5 }).then(r => setPosts(r.data || []));
    api.getPlatformAnalytics('instagram').then(r => setPlatformData(r.data || []));
  }, []);

  // Chart data
  const followerChartData = platformData.slice(-14).map(d => ({
    date: d.date.slice(5),
    followers: d.followers,
    reach: Math.round(d.total_reach / 1000),
  }));

  const engagementByPlatform = [
    { name: 'Instagram', engagement: 9.2, fill: '#E1306C' },
    { name: 'TikTok', engagement: 12.1, fill: '#000000' },
    { name: 'YouTube', engagement: 7.8, fill: '#FF0000' },
    { name: 'Pinterest', engagement: 6.4, fill: '#E60023' },
  ];

  const revenueBySource = [
    { name: 'ShopMy', value: 4441.25, fill: '#34d399' },
    { name: 'LTK', value: 2100, fill: '#f472b6' },
    { name: 'Amazon', value: 890.25, fill: '#fb923c' },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Dashboard</h1>
          <p className="text-sm text-surface-500 mt-0.5">Welcome back! Here's how you're performing.</p>
        </div>
        <div className="flex gap-2">
          <select className="input w-auto text-xs">
            <option>Last 7 days</option>
            <option selected>Last 30 days</option>
            <option>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Followers" value={overview?.total_followers || 916000} change={4.2} icon={Users} />
        <MetricCard title="Weekly Reach" value={overview?.weekly_reach || 2840000} change={12.8} icon={Eye} />
        <MetricCard title="Avg Engagement" value={overview?.avg_engagement_rate || 8.6} change={1.3} suffix="%" icon={Heart} />
        <MetricCard title="Revenue (30d)" value={overview?.total_revenue_30d || 7431.50} change={22.5} prefix="$" icon={DollarSign} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Follower Growth */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Follower Growth & Reach (14d)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={followerChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Line type="monotone" dataKey="followers" stroke="#ec4899" strokeWidth={2} dot={false} name="Followers" />
              <Line type="monotone" dataKey="reach" stroke="#a78bfa" strokeWidth={2} dot={false} name="Reach (K)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Engagement by Platform */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Engagement Rate by Platform</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={engagementByPlatform}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" unit="%" />
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Bar dataKey="engagement" radius={[8, 8, 0, 0]} name="Engagement %">
                {engagementByPlatform.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Insights + Recent + Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI Insights */}
        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <h3 className="text-sm font-semibold text-surface-800">AI Insights</h3>
          </div>
          <div className="space-y-3">
            {insights.slice(0, 4).map(ins => (
              <InsightCard key={ins.id} insight={ins} />
            ))}
          </div>
        </div>

        {/* Recent Posts */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Recent Posts</h3>
          <div className="space-y-3">
            {posts.filter(p => p.status === 'published').slice(0, 5).map(post => (
              <div key={post.id} className="flex items-center gap-3">
                <PlatformIcon platform={post.platform} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-surface-800 truncate">
                    {post.caption?.slice(0, 50)}...
                  </p>
                  <p className="text-[11px] text-surface-400">
                    {post.reach >= 1000000 ? `${(post.reach/1000000).toFixed(1)}M reach` : `${(post.reach/1000).toFixed(0)}K reach`}
                    {' · '}{post.engagement_rate}% eng
                  </p>
                </div>
                <span className="text-[11px] text-surface-400 shrink-0">
                  {Math.round((Date.now() - new Date(post.published_at)) / 86400000)}d ago
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-800 mb-4">Revenue by Source (30d)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={revenueBySource} cx="50%" cy="50%" outerRadius={60} innerRadius={35} dataKey="value" paddingAngle={4}>
                {revenueBySource.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(v) => `$${v.toLocaleString()}`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {revenueBySource.map(s => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                  <span className="text-surface-600">{s.name}</span>
                </div>
                <span className="font-medium">${s.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
