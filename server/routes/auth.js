import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

const APP_PASSWORD = process.env.APP_PASSWORD || 'glowstack2026';
const TOKEN_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_PASSWORD || 'fallback-secret';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Create a signed token with expiry (no external DB needed)
function createToken() {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + TOKEN_EXPIRY_MS,
    nonce: crypto.randomBytes(8).toString('hex'),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// Verify a signed token
function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return false;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (password !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = createToken();
  res.json({ token, expires_in: TOKEN_EXPIRY_MS });
});

// POST /api/auth/verify
router.post('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (verifyToken(token)) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // With signed tokens, logout is client-side (remove from localStorage)
  res.json({ message: 'Logged out' });
});

// Middleware: protect API routes
export function requireAuth(req, res, next) {
  // Skip auth for health endpoint
  if (req.path === '/health') {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Session expired' });
  }

  next();
}

export default router;
