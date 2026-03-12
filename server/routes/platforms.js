import { Router } from 'express';
import { supabase, isSupabaseConfigured } from '../services/supabase.js';
import { demoPlatforms } from '../services/demoData.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) return res.json({ data: demoPlatforms });
    const { data, error } = await supabase.from('platform_connections').select('*').order('platform');
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Platforms GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:platform', async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      const p = demoPlatforms.find(pl => pl.platform === req.params.platform);
      if (!p) return res.status(404).json({ error: 'Platform not found' });
      return res.json(p);
    }
    const { data, error } = await supabase
      .from('platform_connections').select('*').eq('platform', req.params.platform).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Platform GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:platform/setup-guide', (req, res) => {
  const guides = {
    instagram: {
      platform: 'instagram', title: 'Connect Instagram Business Account',
      steps: [
        { step: 1, title: 'Create a Meta Developer Account', description: 'Go to developers.facebook.com and create a developer account.', url: 'https://developers.facebook.com' },
        { step: 2, title: 'Create a Meta App', description: 'Create a new app and select "Business" type. Add Instagram Graph API.' },
        { step: 3, title: 'Configure Instagram Basic Display', description: 'Add Instagram Basic Display and configure OAuth redirect URI.' },
        { step: 4, title: 'Get Access Tokens', description: 'Generate a long-lived access token using the token generator.' },
        { step: 5, title: 'Enter Credentials', description: 'Enter your App ID, App Secret, and Access Token below.' },
      ],
      fields: ['app_id', 'app_secret', 'access_token'],
    },
    tiktok: {
      platform: 'tiktok', title: 'Connect TikTok for Business',
      steps: [
        { step: 1, title: 'Apply for TikTok Developer Access', description: 'Visit TikTok for Developers portal.', url: 'https://developers.tiktok.com' },
        { step: 2, title: 'Create an App', description: 'Create a new app and request required scopes.' },
        { step: 3, title: 'Configure OAuth', description: 'Set up redirect URI and obtain client key/secret.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter your Client Key and Client Secret below.' },
      ],
      fields: ['client_key', 'client_secret'],
    },
    youtube: {
      platform: 'youtube', title: 'Connect YouTube Channel',
      steps: [
        { step: 1, title: 'Create Google Cloud Project', description: 'Go to console.cloud.google.com.', url: 'https://console.cloud.google.com' },
        { step: 2, title: 'Enable YouTube Data API', description: 'Enable YouTube Data API v3 and Analytics API.' },
        { step: 3, title: 'Create OAuth Credentials', description: 'Create OAuth 2.0 credentials and consent screen.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter your Client ID and Client Secret below.' },
      ],
      fields: ['client_id', 'client_secret'],
    },
    pinterest: {
      platform: 'pinterest', title: 'Connect Pinterest Business',
      steps: [
        { step: 1, title: 'Create Pinterest Developer Account', description: 'Visit developers.pinterest.com.', url: 'https://developers.pinterest.com' },
        { step: 2, title: 'Configure App Settings', description: 'Set up redirect URIs and API scopes.' },
        { step: 3, title: 'Get Access Token', description: 'Generate access token via OAuth.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter your App ID and App Secret below.' },
      ],
      fields: ['app_id', 'app_secret'],
    },
    google_photos: {
      platform: 'google_photos', title: 'Connect Google Photos',
      steps: [
        { step: 1, title: 'Use Google Cloud Project', description: 'Use same project as YouTube or create new one.' },
        { step: 2, title: 'Enable Photos Library API', description: 'Enable Google Photos Library API.' },
        { step: 3, title: 'Configure OAuth Consent', description: 'Add Photos Library API scopes.' },
        { step: 4, title: 'Authorize', description: 'Click Authorize below to connect.' },
      ],
      fields: ['client_id', 'client_secret'],
    },
    facebook: {
      platform: 'facebook', title: 'Connect Facebook Page',
      steps: [
        { step: 1, title: 'Use Existing Meta App', description: 'Use Meta app from Instagram or create new one.' },
        { step: 2, title: 'Add Facebook Pages API', description: 'Add Pages API product.' },
        { step: 3, title: 'Generate Page Token', description: 'Select Page and generate long-lived token.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter credentials below.' },
      ],
      fields: ['app_id', 'app_secret', 'page_access_token'],
    },
    shopmy: {
      platform: 'shopmy', title: 'Connect ShopMy',
      steps: [
        { step: 1, title: 'Log into ShopMy', description: 'Go to shopmy.us and sign in.' },
        { step: 2, title: 'Access API Settings', description: 'Navigate to Settings > API Access.' },
        { step: 3, title: 'Enter Credentials', description: 'Enter your API key below.' },
      ],
      fields: ['api_key'],
    },
    ltk: {
      platform: 'ltk', title: 'Connect LTK (LikeToKnowIt)',
      steps: [
        { step: 1, title: 'Log into LTK Creator', description: 'Sign into your LTK account.' },
        { step: 2, title: 'Request API Access', description: 'Contact LTK support for API credentials.' },
        { step: 3, title: 'Enter Credentials', description: 'Enter credentials below.' },
      ],
      fields: ['api_key', 'api_secret'],
    },
    walmart: {
      platform: 'walmart', title: 'Connect Walmart Creator',
      steps: [
        { step: 1, title: 'Join Walmart Creator', description: 'Sign up for Walmart Creator program.' },
        { step: 2, title: 'Access API Credentials', description: 'Go to creator dashboard settings.' },
        { step: 3, title: 'Enter Credentials', description: 'Enter credentials below.' },
      ],
      fields: ['api_key'],
    },
    amazon: {
      platform: 'amazon', title: 'Connect Amazon Influencer',
      steps: [
        { step: 1, title: 'Join Amazon Influencer Program', description: 'Sign up at amazon.com/influencers.' },
        { step: 2, title: 'Access Associates API', description: 'Go to Product Advertising API section.' },
        { step: 3, title: 'Generate Credentials', description: 'Create API key pair.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter credentials below.' },
      ],
      fields: ['access_key', 'secret_key', 'associate_tag'],
    },
  };
  const guide = guides[req.params.platform];
  if (!guide) return res.status(404).json({ error: 'No setup guide available' });
  res.json(guide);
});

router.post('/:platform/connect', async (req, res) => {
  try {
    const platform = req.params.platform;
    const { credentials } = req.body;

    if (!isSupabaseConfigured()) {
      const p = demoPlatforms.find(pl => pl.platform === platform);
      if (p) { p.is_connected = true; p.connected_at = new Date().toISOString(); }
      return res.json({ message: `${platform} connected (demo)`, platform: p });
    }

    const { data, error } = await supabase
      .from('platform_connections')
      .upsert({
        platform,
        display_name: platform.charAt(0).toUpperCase() + platform.slice(1).replace('_', ' '),
        is_connected: true,
        connected_at: new Date().toISOString(),
        metadata: credentials || {},
      }, { onConflict: 'platform' })
      .select()
      .single();
    if (error) throw error;
    res.json({ message: `${platform} connected`, platform: data });
  } catch (err) {
    console.error('Platform connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:platform/disconnect', async (req, res) => {
  try {
    const platform = req.params.platform;
    if (!isSupabaseConfigured()) {
      const p = demoPlatforms.find(pl => pl.platform === platform);
      if (p) { p.is_connected = false; p.connected_at = null; }
      return res.json({ message: `${platform} disconnected`, platform: p });
    }

    const { data, error } = await supabase
      .from('platform_connections')
      .update({ is_connected: false, access_token: null, refresh_token: null })
      .eq('platform', platform)
      .select()
      .single();
    if (error) throw error;
    res.json({ message: `${platform} disconnected`, platform: data });
  } catch (err) {
    console.error('Platform disconnect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
