import { Router } from 'express';
import { demoPlatforms } from '../services/demoData.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({ data: demoPlatforms });
});

router.get('/:platform', (req, res) => {
  const p = demoPlatforms.find(pl => pl.platform === req.params.platform);
  if (!p) return res.status(404).json({ error: 'Platform not found' });
  res.json(p);
});

// GET /api/platforms/:platform/setup-guide
router.get('/:platform/setup-guide', (req, res) => {
  const guides = {
    instagram: {
      platform: 'instagram',
      title: 'Connect Instagram Business Account',
      steps: [
        { step: 1, title: 'Create a Meta Developer Account', description: 'Go to developers.facebook.com and create a developer account if you don\'t have one.', url: 'https://developers.facebook.com' },
        { step: 2, title: 'Create a Meta App', description: 'Create a new app and select "Business" type. Add the Instagram Graph API product.' },
        { step: 3, title: 'Configure Instagram Basic Display', description: 'Add Instagram Basic Display to your app and configure the OAuth redirect URI.' },
        { step: 4, title: 'Get Access Tokens', description: 'Generate a long-lived access token using the token generator in the app dashboard.' },
        { step: 5, title: 'Enter Credentials', description: 'Enter your App ID, App Secret, and Access Token in the fields below.' },
      ],
      fields: ['app_id', 'app_secret', 'access_token'],
    },
    tiktok: {
      platform: 'tiktok',
      title: 'Connect TikTok for Business',
      steps: [
        { step: 1, title: 'Apply for TikTok Developer Access', description: 'Visit the TikTok for Developers portal and apply for API access.', url: 'https://developers.tiktok.com' },
        { step: 2, title: 'Create an App', description: 'Create a new app in the developer portal and request the required scopes.' },
        { step: 3, title: 'Configure OAuth', description: 'Set up the OAuth redirect URI and obtain your client key and secret.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter your Client Key and Client Secret below.' },
      ],
      fields: ['client_key', 'client_secret'],
    },
    youtube: {
      platform: 'youtube',
      title: 'Connect YouTube Channel',
      steps: [
        { step: 1, title: 'Create Google Cloud Project', description: 'Go to console.cloud.google.com and create a new project.', url: 'https://console.cloud.google.com' },
        { step: 2, title: 'Enable YouTube Data API', description: 'Enable the YouTube Data API v3 and YouTube Analytics API in your project.' },
        { step: 3, title: 'Create OAuth Credentials', description: 'Create OAuth 2.0 credentials and configure the consent screen.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter your Client ID and Client Secret below.' },
      ],
      fields: ['client_id', 'client_secret'],
    },
    pinterest: {
      platform: 'pinterest',
      title: 'Connect Pinterest Business',
      steps: [
        { step: 1, title: 'Create Pinterest Developer Account', description: 'Visit developers.pinterest.com and create an app.', url: 'https://developers.pinterest.com' },
        { step: 2, title: 'Configure App Settings', description: 'Set up redirect URIs and request the required API scopes.' },
        { step: 3, title: 'Get Access Token', description: 'Generate an access token via OAuth flow.' },
        { step: 4, title: 'Enter Credentials', description: 'Enter your App ID and App Secret below.' },
      ],
      fields: ['app_id', 'app_secret'],
    },
    google_photos: {
      platform: 'google_photos',
      title: 'Connect Google Photos',
      steps: [
        { step: 1, title: 'Use Existing Google Cloud Project', description: 'Use the same Google Cloud project as YouTube, or create a new one.' },
        { step: 2, title: 'Enable Photos Library API', description: 'Enable the Google Photos Library API in your project.' },
        { step: 3, title: 'Configure OAuth Consent', description: 'Add Photos Library API scopes to your OAuth consent screen.' },
        { step: 4, title: 'Authorize', description: 'Click Authorize below to connect your Google Photos account.' },
      ],
      fields: ['client_id', 'client_secret'],
    },
  };

  const guide = guides[req.params.platform];
  if (!guide) return res.status(404).json({ error: 'No setup guide available' });
  res.json(guide);
});

// POST /api/platforms/:platform/connect
router.post('/:platform/connect', (req, res) => {
  const p = demoPlatforms.find(pl => pl.platform === req.params.platform);
  if (p) {
    p.is_connected = true;
    p.connected_at = new Date().toISOString();
  }
  res.json({ message: `${req.params.platform} connected successfully (demo mode)`, platform: p });
});

// POST /api/platforms/:platform/disconnect
router.post('/:platform/disconnect', (req, res) => {
  const p = demoPlatforms.find(pl => pl.platform === req.params.platform);
  if (p) {
    p.is_connected = false;
    p.connected_at = null;
  }
  res.json({ message: `${req.params.platform} disconnected`, platform: p });
});

export default router;
