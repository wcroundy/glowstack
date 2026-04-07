import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { isSupabaseConfigured } from './services/supabase.js';
import authRoutes, { requireAuth } from './routes/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.VERCEL
    ? true  // Allow all origins on Vercel (same domain)
    : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Auth routes (before middleware so login isn't protected)
app.use('/api/auth', authRoutes);

// Google OAuth callback (before auth middleware — browser redirect, no Bearer token)
import googlePhotosRoutes from './routes/googlePhotos.js';
app.use('/api/auth/google', googlePhotosRoutes); // callback route

// Meta OAuth callback (before auth middleware — browser redirect, no Bearer token)
import metaRoutes from './routes/meta.js';
app.use('/api/auth/meta', metaRoutes); // callback route

// Meta routes mounted BEFORE auth middleware:
// - webhook (Meta verification + events — unauthenticated)
// - data-deletion (Meta data deletion callback — unauthenticated)
// - privacy-policy, terms (public legal pages)
// - All other Meta routes also work here (they check Meta connection internally)
app.use('/api/meta', metaRoutes);

// TikTok OAuth callback (before auth middleware — browser redirect, no Bearer token)
import tiktokRoutes from './routes/tiktok.js';
app.use('/api/auth/tiktok', tiktokRoutes); // callback route

// Protect all other API routes
app.use('/api', requireAuth);

// Google Photos API routes (protected)
app.use('/api/google-photos', googlePhotosRoutes);

// TikTok API routes (protected)
app.use('/api/tiktok', tiktokRoutes);

// Routes
import mediaRoutes from './routes/media.js';
import analyticsRoutes from './routes/analytics.js';
import postsRoutes from './routes/posts.js';
import calendarRoutes from './routes/calendar.js';
import chatRoutes from './routes/chat.js';
import platformRoutes from './routes/platforms.js';
import dashboardRoutes from './routes/dashboard.js';
import aiRoutes from './routes/ai.js';
import reportsRoutes from './routes/reports.js';
import tagsRoutes from './routes/tags.js';
import videoBreakdownRoutes from './routes/videoBreakdown.js';

app.use('/api/media', mediaRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/video-breakdown', videoBreakdownRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: isSupabaseConfigured() ? 'connected' : 'using demo data',
    version: '0.1.0',
  });
});

// Serve static files in production (non-Vercel)
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../dist/index.html'));
  });
}

// Only start listening when running locally (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  GlowStack API running on port ${PORT}`);
    console.log(`  Supabase: ${isSupabaseConfigured() ? 'Connected' : 'Demo mode (configure .env)'}`);
    console.log(`  Health:   http://localhost:${PORT}/api/health\n`);
  });
}

export default app;
