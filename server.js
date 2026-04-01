// ⚠️  dotenv MUST be the very first import so that process.env vars are
//     populated before any other module (routes, services, etc.) is evaluated.
//     ES module `import` statements are hoisted — if dotenv.config() were
//     called *after* the other imports, all services would be constructed
//     with undefined env vars (e.g. OPENAI_API_KEY), causing embedding models
//     to fall back to a default 384-dim model instead of the expected 1536-dim.
import 'dotenv/config';

import express          from 'express';
import cors             from 'cors';
import { createRequire } from 'module';
import path             from 'path';
import { fileURLToPath } from 'url';
import authRoutes        from './routes/auth.js';
import apiRoutes         from './routes/api.js';
import chatRoutes        from './routes/chat.js';
import chatSimpleRoutes  from './routes/chat-simple.js';
import chatRagRoutes     from './routes/chat-rag.js';
import adminRagRoutes    from './routes/admin-rag.js';
import webhookRoutes     from './routes/webhooks.js';
import dashboardRoutes   from './routes/dashboard.js';
import { initDashboardDb } from './config/dashboard-db.js';
import initializeCronJobs  from './jobs/sync-scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// ── 1. CORS ───────────────────────────────────────────────────────────────────
// These paths are called directly from merchant storefronts (any *.myshopify.com domain)
// — they MUST have open CORS with no credentials requirement.
const widgetPaths = [
  '/smart-search-widget.js',
  '/api/widget/settings',
  '/api/chat/widget',
  '/api/chat/rag',          // RAG streaming — called by widget ChatPanel
  '/api/search/products',   // product search — public
];
const openCors  = cors({ origin: '*', credentials: false });
const adminCors = cors({
  origin: (origin, cb) => cb(null, true), // permissive during dev
  credentials: true,
});

// Apply the right CORS policy per path — open for widget, credentialed for dashboard/admin
app.use((req, res, next) => {
  const isWidget = widgetPaths.some(p => req.path === p || req.path.startsWith(p));
  return isWidget ? openCors(req, res, next) : adminCors(req, res, next);
});

// ── 2. Webhooks (MUST come before json parser — raw body needed for HMAC) ────
app.use('/webhooks', webhookRoutes);

// ── 3. Body parsers ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 4. Serve the compiled storefront search widget ──────────────────────────
// search-widget.js is injected into every merchant storefront via Shopify ScriptTag.
// Built locally: npm run build:widget  (widget/vite.widget.config.ts → public/smart-search.js)
app.use('/public', express.static(path.join(__dirname, 'public')));
app.get('/smart-search-widget.js', (_req, res) => {
  const widgetPath = path.join(__dirname, 'public', 'smart-search.js');
  console.log('[smart-search-widget.js] Serving from:', widgetPath);
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300'); // 5-min cache
  res.sendFile(widgetPath, err => {
    if (err) {
      console.error('[smart-search-widget.js] Error serving file:', err.message);
      console.error('[smart-search-widget.js] Attempted path:', widgetPath);
      res.status(404).send('// search widget not built yet — run: npm run build:widget');
    }
  });
});

// ── 5. Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── 6. Dashboard API routes (must register BEFORE auth catches '/') ───────────
app.use('/api', dashboardRoutes);

// ── 7. Existing chat / product API routes ────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/api', chatRoutes);
app.use('/api', chatSimpleRoutes);
app.use('/api', chatRagRoutes);
app.use('/api', adminRagRoutes);

// ── 8. Auth gatekeeper (handles GET /auth, GET /auth/callback) ───────────────
app.use('/auth', authRoutes);

// ── 9. React dashboard — DEV: proxy to Vite  |  PROD: serve dist ─────────────
if (isDev) {
  // Dynamically import http-proxy-middleware (CJS) via createRequire
  const require = createRequire(import.meta.url);
  const { createProxyMiddleware } = require('http-proxy-middleware');

  app.use('/', createProxyMiddleware({
    target: 'http://localhost:5173',
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
  }));
  console.log('  🔀  Proxying / → Vite dev server (http://localhost:5173)');
} else {
  // Production: serve compiled dashboard
  const distPath = path.join(__dirname, 'dashboard', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) =>
    res.sendFile(path.join(distPath, 'index.html')));
}

// ── 10. Error handler ─────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`
� Shopify Smart Search App — AI-Powered Product Discovery
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Host : ${process.env.HOST || `http://localhost:${PORT}`}
🔧 Mode : ${isDev ? 'development (Vite proxy)' : 'production (dist)'}
🗄️  DB   : ${isDev ? process.env.DATABASE_URL : '***'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

  // Ensure all dashboard DB tables exist
  try {
    await initDashboardDb();
    console.log('  ✅  Dashboard DB tables ready');
  } catch (e) {
    console.warn('  ⚠️   Dashboard DB init warning:', e.message);
  }

  if (process.env.NODE_ENV !== 'test') {
    initializeCronJobs();
  }
});

export default app;
