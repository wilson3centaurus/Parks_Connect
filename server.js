import 'dotenv/config';
import express from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cookieSession from 'cookie-session';
import expressLayouts from 'express-ejs-layouts';

// ── API routes (backend/) ─────────────────────────────────────────────────────
import apiAuthRoutes from './backend/routes/auth.js';
import apiParksRoutes from './backend/routes/parks.js';
import apiAlertsRoutes from './backend/routes/alerts.js';
import apiAnalyticsRoutes from './backend/routes/analytics.js';
import apiBlockchainRoutes from './backend/routes/blockchain.js';
import apiEnvLogsRoutes from './backend/routes/environmentalLogs.js';
import apiFeedbackRoutes from './backend/routes/feedback.js';
import apiMobileRoutes from './backend/routes/mobile.js';
import apiNotificationsRoutes from './backend/routes/notifications.js';
import apiReportsRoutes from './backend/routes/reports.js';
import apiVisitorLogsRoutes from './backend/routes/visitorLogs.js';

// ── Web routes (web/) ─────────────────────────────────────────────────────────
import webAuthRoutes from './web/routes/auth.js';
import webDashboardRoutes from './web/routes/dashboard.js';
import webPublicRoutes from './web/routes/public.js';

// ── Background jobs ───────────────────────────────────────────────────────────
import { runMigrations } from './backend/utils/migrate.js';
import { evaluateFeedbackAlerts, escalateOverdueAlerts } from './backend/utils/notifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isVercel = Boolean(process.env.VERCEL);

// Upload / export dirs (same logic as backend/server.js)
const uploadDir = process.env.FILE_UPLOAD_DIR
  ? path.resolve(__dirname, process.env.FILE_UPLOAD_DIR)
  : isVercel
    ? path.join(os.tmpdir(), 'parks-connect-uploads')
    : path.join(__dirname, 'backend', 'uploads');

const exportDir = process.env.REPORT_EXPORT_DIR
  ? path.resolve(__dirname, process.env.REPORT_EXPORT_DIR)
  : isVercel
    ? path.join(os.tmpdir(), 'parks-connect-exports')
    : path.join(__dirname, 'backend', 'exports');

// ── App setup ─────────────────────────────────────────────────────────────────
const app = express();

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// ── EJS (from web/views) ──────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web', 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// ── Session (cookie-session, stateless — works on Vercel) ────────────────────
const sessionMaxAge = Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);
app.use(cookieSession({
  name: 'parks_connect.sid',
  keys: [process.env.SESSION_SECRET || 'dev_secret'],
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: sessionMaxAge,
    sameSite: 'lax'
  },
  signed: true
}));

// ── Locals ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.currentPath = req.path;
  next();
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use('/public', express.static(path.join(__dirname, 'web', 'public')));
app.use('/uploads', express.static(uploadDir));
app.use('/exports', express.static(exportDir));

// ── PWA assets ────────────────────────────────────────────────────────────────
app.get('/sw.js',       (_req, res) => res.sendFile(path.join(__dirname, 'web', 'public', 'sw.js')));
app.get('/manifest.json', (_req, res) => res.sendFile(path.join(__dirname, 'web', 'public', 'manifest.json')));

// ── API routes ────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth',              apiAuthRoutes);
app.use('/api/parks',             apiParksRoutes);
app.use('/api/alerts',            apiAlertsRoutes);
app.use('/api/analytics',         apiAnalyticsRoutes);
app.use('/api/admin/blockchain',  apiBlockchainRoutes);
app.use('/api/environmental-logs', apiEnvLogsRoutes);
app.use('/api/feedback',          apiFeedbackRoutes);
app.use('/api/mobile',            apiMobileRoutes);
app.use('/api/notifications',     apiNotificationsRoutes);
app.use('/api/reports',           apiReportsRoutes);
app.use('/api/visitor-logs',      apiVisitorLogsRoutes);

// ── Public API proxy (tourist page — calls same server) ───────────────────────
app.use('/api-proxy', async (req, res) => {
  try {
    const { default: axios } = await import('axios');
    const base = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    const url  = `${base}/api${req.path}`;
    const resp = await axios({ method: req.method, url, data: req.body, params: req.query, headers: { 'Content-Type': 'application/json' } });
    return res.status(resp.status).json(resp.data);
  } catch (err) {
    const status = err.response?.status || 500;
    return res.status(status).json(err.response?.data || { message: 'Proxy error' });
  }
});

// ── Home page ─────────────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  try {
    const { default: axios } = await import('axios');
    const base  = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    const parks = await axios.get(`${base}/api/parks`).then((r) => r.data).catch(() => []);
    return res.render('home', { layout: false, parks });
  } catch {
    return res.render('home', { layout: false, parks: [] });
  }
});

// ── Web routes ────────────────────────────────────────────────────────────────
app.use('/', webPublicRoutes);
app.use('/', webAuthRoutes);
app.use('/dashboard', webDashboardRoutes);

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (String(err.message || '').toLowerCase().includes('unsupported file type')) {
    return res.status(400).json({ message: 'Only JPEG, PNG, and WEBP are allowed.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Upload exceeds max file size.' });
  }
  if (res.headersSent) return;
  try {
    return res.status(500).render('error', { message: 'Something went wrong.' });
  } catch {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
function logAddresses(port) {
  console.log(`Parks Connect ready → http://localhost:${port}`);
  const nets = os.networkInterfaces();
  Object.values(nets).forEach((list) => {
    (list || []).forEach((addr) => {
      if (!addr.internal && addr.family === 'IPv4') {
        console.log(`  LAN → http://${addr.address}:${port}`);
      }
    });
  });
}

let startupPromise = null;

async function ensureReady() {
  if (!startupPromise) {
    startupPromise = runMigrations().catch((err) => {
      startupPromise = null;
      throw err;
    });
  }
  return startupPromise;
}

if (!isVercel) {
  // Listen immediately — don't wait for migrations to finish
  app.listen(PORT, () => {
    logAddresses(PORT);
  });

  // Run migrations in background; start alert jobs once done
  ensureReady()
    .then(() => {
      console.log('Migrations complete.');
      const escalationMs = Math.max(
        Number(process.env.ALERT_ESCALATION_INTERVAL_MS || 900_000),
        15 * 60 * 1000
      );
      setInterval(async () => {
        try {
          const gen  = await evaluateFeedbackAlerts();
          const esc  = await escalateOverdueAlerts();
          if (gen > 0 || esc > 0) console.log(`Alerts: generated ${gen}, escalated ${esc}.`);
        } catch (e) {
          console.error('Alert job failed', e);
        }
      }, escalationMs);
    })
    .catch((err) => {
      console.error('Migrations failed:', err);
    });
}

// Vercel serverless handler
export default async function handler(req, res) {
  try {
    await ensureReady();
    return app(req, res);
  } catch (err) {
    console.error('Init failed', err);
    return res.status(500).json({ message: 'Failed to initialize' });
  }
}
