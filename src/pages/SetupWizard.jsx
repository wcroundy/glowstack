import React, { useState, useEffect } from 'react';
import {
  Check, ChevronRight, ExternalLink, Plug, AlertCircle,
  RefreshCw, Unplug, Sparkles, Shield, Instagram, Facebook, Link2, Loader2, Music2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import PlatformIcon from '../components/common/PlatformIcon';

const PLATFORM_DESCRIPTIONS = {
  instagram: 'Connect your Instagram Business account to pull post analytics, engagement data, audience demographics, and sync media.',
  tiktok: 'Connect TikTok for Business to access video performance metrics, trending sounds data, and audience insights.',
  youtube: 'Connect your YouTube channel to import video analytics, subscriber data, watch time metrics, and audience retention.',
  pinterest: 'Connect Pinterest Business to track pin performance, board analytics, and audience engagement data.',
  facebook: 'Connect your Facebook Page to pull post reach, engagement metrics, and cross-platform audience data.',
  shopmy: 'Connect ShopMy to track affiliate link clicks, conversions, and commission earnings from your product recommendations.',
  ltk: 'Connect LikeToKnowIt to import affiliate sales data, product click-through rates, and commission tracking.',
  walmart: 'Connect Walmart Creator to track product affiliate performance and shopping commissions.',
  amazon: 'Connect Amazon Influencer to import storefront analytics, product recommendations performance, and commission data.',
  google_photos: 'Connect Google Photos to sync your media library, import photos and videos, and enable AI-powered organization.',
};

function PlatformCard({ platform, onExpand, expanded }) {
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({});

  const loadGuide = async () => {
    if (guide) return;
    setLoading(true);
    try {
      const data = await api.getPlatformSetupGuide(platform.platform);
      setGuide(data);
    } catch (e) {
      // No guide available for this platform
    }
    setLoading(false);
  };

  useEffect(() => {
    if (expanded) loadGuide();
  }, [expanded]);

  const handleConnect = async () => {
    try {
      await api.connectPlatform(platform.platform, formData);
      platform.is_connected = true;
    } catch (e) { console.error(e); }
  };

  return (
    <div className={`card transition-all ${expanded ? 'ring-2 ring-brand-300' : ''}`}>
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-50 rounded-t-2xl transition-colors"
        onClick={() => onExpand(expanded ? null : platform.platform)}
      >
        <PlatformIcon platform={platform.platform} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-surface-900">{platform.display_name}</h3>
            {platform.is_connected ? (
              <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">
                <Check className="w-3 h-3 mr-0.5" /> Connected
              </span>
            ) : (
              <span className="badge bg-surface-100 text-surface-500 text-[10px]">Not Connected</span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">{PLATFORM_DESCRIPTIONS[platform.platform]?.slice(0, 80)}...</p>
          {platform.account_username && (
            <p className="text-xs text-brand-500 font-medium mt-0.5">{platform.account_username}</p>
          )}
        </div>
        <ChevronRight className={`w-5 h-5 text-surface-300 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {/* Expanded setup guide */}
      {expanded && (
        <div className="border-t px-4 pb-4">
          {platform.is_connected ? (
            <div className="pt-4 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <Check className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Connected successfully</p>
                  <p className="text-xs text-emerald-600">
                    {platform.account_username && `Account: ${platform.account_username}`}
                    {platform.followers && ` · ${(platform.followers/1000).toFixed(0)}K followers`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs"><RefreshCw className="w-3.5 h-3.5" /> Sync Now</button>
                <button className="btn-ghost text-xs text-red-500 hover:bg-red-50"><Unplug className="w-3.5 h-3.5" /> Disconnect</button>
              </div>
            </div>
          ) : guide ? (
            <div className="pt-4 space-y-4">
              <p className="text-sm text-surface-600">{PLATFORM_DESCRIPTIONS[platform.platform]}</p>

              {/* Steps */}
              <div className="space-y-3">
                {guide.steps.map(step => (
                  <div key={step.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {step.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-surface-800">{step.title}</p>
                      <p className="text-xs text-surface-500 mt-0.5">{step.description}</p>
                      {step.url && (
                        <a href={step.url} target="_blank" rel="noreferrer" className="text-xs text-brand-500 hover:underline flex items-center gap-1 mt-1">
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Credential Fields */}
              {guide.fields && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Credentials</h4>
                  {guide.fields.map(field => (
                    <div key={field}>
                      <label className="text-xs font-medium text-surface-600 block mb-1">
                        {field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </label>
                      <input
                        type="password"
                        className="input text-sm"
                        placeholder={`Enter your ${field.replace(/_/g, ' ')}`}
                        value={formData[field] || ''}
                        onChange={e => setFormData(f => ({ ...f, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <button onClick={handleConnect} className="btn-primary w-full">
                    <Plug className="w-4 h-4" /> Connect {platform.display_name}
                  </button>
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="pt-4 text-center text-sm text-surface-400">Loading setup guide...</div>
          ) : (
            <div className="pt-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <p className="text-xs text-amber-700">Setup guide not yet available for this platform. Check back soon!</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.metaStatus().then(s => { setStatus(s); setLoading(false); }).catch(() => setLoading(false));

    // Check URL params for connection result
    const params = new URLSearchParams(window.location.search);
    if (params.get('meta_connected') === 'true') {
      api.metaStatus().then(s => { setStatus(s); setLoading(false); });
      setExpanded(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('meta_error')) {
      setError(decodeURIComponent(params.get('meta_error')));
      setExpanded(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    try {
      const { url } = await api.metaAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('Meta auth error:', err);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.metaDisconnect();
      setStatus(prev => ({ ...prev, connected: false, instagram: null, facebook: null }));
    } catch (err) {
      console.error('Meta disconnect error:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return null;
  if (!status?.configured) return null;

  return (
    <div className={`card transition-all ${expanded ? 'ring-2 ring-brand-300' : ''}`}>
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-50 rounded-t-2xl transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-500 flex items-center justify-center flex-shrink-0">
          <Instagram className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-surface-900">Instagram & Facebook</h3>
            {status.connected ? (
              <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">
                <Check className="w-3 h-3 mr-0.5" /> Connected
              </span>
            ) : (
              <span className="badge bg-surface-100 text-surface-500 text-[10px]">Not Connected</span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {status.connected
              ? `@${status.instagram?.username || 'Connected'}${status.facebook?.pageName ? ` · ${status.facebook.pageName}` : ''}`
              : 'Connect via Facebook to pull Instagram & Facebook post insights and analytics.'}
          </p>
        </div>
        <ChevronRight className={`w-5 h-5 text-surface-300 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4">
          {status.connected ? (
            <div className="pt-4 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <Check className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Connected successfully</p>
                  <p className="text-xs text-emerald-600">
                    {status.instagram?.username && `@${status.instagram.username}`}
                    {status.instagram?.followers && ` · ${status.instagram.followers.toLocaleString()} followers`}
                  </p>
                </div>
              </div>

              {status.instagram?.profilePicture && (
                <div className="flex items-center gap-3">
                  <img src={status.instagram.profilePicture} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="text-sm font-medium text-surface-800">{status.instagram.name || status.instagram.username}</p>
                    {status.facebook?.pageName && (
                      <p className="text-xs text-surface-500 flex items-center gap-1">
                        <Facebook className="w-3 h-3" /> {status.facebook.pageName}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/social')}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> View Insights
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="btn-ghost text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5"
                >
                  {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-4 space-y-4">
              <p className="text-sm text-surface-600">
                Connect your Instagram Business account and Facebook Page to pull in post performance data,
                engagement metrics, and audience insights — all through a single Meta login.
              </p>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">Click Connect below</p>
                    <p className="text-xs text-surface-500 mt-0.5">You'll be redirected to Facebook to log in and grant permissions.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">Select your Facebook Page</p>
                    <p className="text-xs text-surface-500 mt-0.5">Choose the Page linked to your Instagram Business account.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">Start syncing insights</p>
                    <p className="text-xs text-surface-500 mt-0.5">GlowStack will pull in your post performance data automatically.</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button onClick={() => { setError(null); handleConnect(); }} className="btn-primary w-full flex items-center justify-center gap-2">
                <Link2 className="w-4 h-4" /> Connect with Facebook
              </button>

              <p className="text-xs text-surface-400 text-center">
                Requires an Instagram Business or Creator account linked to a Facebook Page.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TikTokCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.tiktokStatus().then(s => { setStatus(s); setLoading(false); }).catch(() => setLoading(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get('tiktok_connected') === 'true') {
      api.tiktokStatus().then(s => { setStatus(s); setLoading(false); });
      setExpanded(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('tiktok_error')) {
      setExpanded(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleConnect = async () => {
    try {
      const { url } = await api.tiktokAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error('TikTok auth error:', err);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await api.tiktokDisconnect();
      setStatus(prev => ({ ...prev, connected: false, account: null }));
    } catch (err) {
      console.error('TikTok disconnect error:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return null;
  if (!status?.configured) return null;

  return (
    <div className={`card transition-all ${expanded ? 'ring-2 ring-brand-300' : ''}`}>
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-50 rounded-t-2xl transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center flex-shrink-0">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-surface-900">TikTok</h3>
            {status.connected ? (
              <span className="badge bg-emerald-100 text-emerald-700 text-[10px]">
                <Check className="w-3 h-3 mr-0.5" /> Connected
              </span>
            ) : (
              <span className="badge bg-surface-100 text-surface-500 text-[10px]">Not Connected</span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-0.5">
            {status.connected
              ? `${status.account?.displayName || 'Connected'}${status.account?.followers != null ? ` · ${status.account.followers.toLocaleString()} followers` : ''}`
              : 'Connect TikTok to pull video performance, engagement metrics, and audience insights.'}
          </p>
        </div>
        <ChevronRight className={`w-5 h-5 text-surface-300 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4">
          {status.connected ? (
            <div className="pt-4 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <Check className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Connected successfully</p>
                  <p className="text-xs text-emerald-600">
                    {status.account?.displayName}
                    {status.account?.followers != null && ` · ${status.account.followers.toLocaleString()} followers`}
                    {status.account?.likes != null && ` · ${status.account.likes.toLocaleString()} likes`}
                  </p>
                </div>
              </div>

              {status.account?.avatar && (
                <div className="flex items-center gap-3">
                  <img src={status.account.avatar} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="text-sm font-medium text-surface-800">{status.account.displayName}</p>
                    {status.account.videoCount != null && (
                      <p className="text-xs text-surface-500">{status.account.videoCount} videos</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/social')}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> View Insights
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="btn-ghost text-xs text-red-500 hover:bg-red-50 flex items-center gap-1.5"
                >
                  {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-4 space-y-4">
              <p className="text-sm text-surface-600">
                Connect your TikTok account to pull in video performance data, view counts,
                engagement metrics, and audience insights.
              </p>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">Click Connect below</p>
                    <p className="text-xs text-surface-500 mt-0.5">You'll be redirected to TikTok to log in and grant permissions.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">Authorize GlowStack</p>
                    <p className="text-xs text-surface-500 mt-0.5">Allow access to your profile info and video analytics.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                  <div>
                    <p className="text-sm font-medium text-surface-800">Start syncing insights</p>
                    <p className="text-xs text-surface-500 mt-0.5">GlowStack will pull in your video performance data automatically.</p>
                  </div>
                </div>
              </div>

              <button onClick={handleConnect} className="btn-primary w-full flex items-center justify-center gap-2">
                <Link2 className="w-4 h-4" /> Connect TikTok
              </button>

              <p className="text-xs text-surface-400 text-center">
                Requires a TikTok account with Creator or Business permissions.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SetupWizard() {
  const [platforms, setPlatforms] = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.getPlatforms().then(r => setPlatforms(r.data || []));
  }, []);

  const connected = platforms.filter(p => p.is_connected).length;
  const total = platforms.length;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">Integrations</h1>
        <p className="text-sm text-surface-500 mt-0.5">Connect your platforms to unlock analytics and content management</p>
      </div>

      {/* Progress */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-surface-700">Setup Progress</span>
          <span className="text-sm font-semibold text-brand-600">{connected}/{total} connected</span>
        </div>
        <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
            style={{ width: `${(connected / total) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-surface-500">
          <Shield className="w-3.5 h-3.5" />
          All credentials are encrypted and stored securely in Supabase
        </div>
      </div>

      {/* Platform Cards */}
      <div className="space-y-3">
        {/* Social Platforms */}
        <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mt-4 mb-2">Social Platforms</h2>
        <MetaCard />
        <TikTokCard />
        {platforms.filter(p => ['youtube', 'pinterest'].includes(p.platform)).map(p => (
          <PlatformCard key={p.id} platform={p} expanded={expanded === p.platform} onExpand={setExpanded} />
        ))}

        {/* Affiliate Platforms */}
        <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mt-6 mb-2">Affiliate & Commerce</h2>
        {platforms.filter(p => ['shopmy', 'ltk', 'walmart', 'amazon'].includes(p.platform)).map(p => (
          <PlatformCard key={p.id} platform={p} expanded={expanded === p.platform} onExpand={setExpanded} />
        ))}

        {/* Media */}
        <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mt-6 mb-2">Media Sources</h2>
        {platforms.filter(p => p.platform === 'google_photos').map(p => (
          <PlatformCard key={p.id} platform={p} expanded={expanded === p.platform} onExpand={setExpanded} />
        ))}
      </div>
    </div>
  );
}
