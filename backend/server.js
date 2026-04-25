import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import visitorRoutes from './routes/visitorLogs.js';
import environmentalRoutes from './routes/environmentalLogs.js';
import feedbackRoutes from './routes/feedback.js';
import notificationRoutes from './routes/notifications.js';
import analyticsRoutes from './routes/analytics.js';
import parkRoutes from './routes/parks.js';
import reportRoutes from './routes/reports.js';
import mobileRoutes from './routes/mobile.js';
import { runMigrations } from './utils/migrate.js';
import { escalateOverdueAlerts } from './utils/notifier.js';

dotenv.config();

const app = express();
const port = process.env.BACKEND_PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logServerAddresses = (listenPort) => {
  const localhostUrl = `http://localhost:${listenPort}`;
  const lanUrls = new Set();
  const nets = os.networkInterfaces();
  Object.values(nets).forEach((ifaceList) => {
    (ifaceList || []).forEach((addr) => {
      if (addr.internal || addr.family !== 'IPv4') return;
      lanUrls.add(`http://${addr.address}:${listenPort}`);
    });
  });

  console.log('Backend ready:');
  console.log(`- Localhost: ${localhostUrl}`);
  if (lanUrls.size > 0) {
    console.log('- LAN / mobile access:');
    lanUrls.forEach((url) => console.log(`  -> ${url}`));
  } else {
    console.log('- LAN / mobile access: no IPv4 address detected');
  }
};

app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));
app.use(helmet());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms :remote-addr'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/exports', express.static(path.join(__dirname, 'exports')));

app.get('/', (_req, res) => {
  res.json({
    message: 'Parks Connect API is running',
    health: '/api/health',
    feedback: '/api/feedback',
    visitorLogs: '/api/visitor-logs',
    environmentalLogs: '/api/environmental-logs',
    notifications: '/api/notifications',
    analytics: '/api/analytics',
    mobile: '/api/mobile'
  });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/visitor-logs', visitorRoutes);
app.use('/api/environmental-logs', environmentalRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/parks', parkRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/mobile', mobileRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found', path: req.originalUrl });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (String(err.message || '').toLowerCase().includes('unsupported file type')) {
    return res.status(400).json({ message: 'Unsupported upload type. Only JPEG, PNG, and WEBP are allowed.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Upload exceeds max file size.' });
  }
  return res.status(500).json({ message: 'Internal server error' });
});

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend running on port ${port}`);
      logServerAddresses(port);

      const escalationIntervalMs = Number(process.env.ALERT_ESCALATION_INTERVAL_MS || 5 * 60 * 1000);
      setInterval(async () => {
        try {
          const escalated = await escalateOverdueAlerts();
          if (escalated > 0) {
            console.log(`Escalated ${escalated} overdue alerts.`);
          }
        } catch (err) {
          console.error('Alert escalation job failed', err);
        }
      }, Math.max(escalationIntervalMs, 60 * 1000));
    });
  })
  .catch((err) => {
    console.error('Failed to run migrations', err);
    process.exit(1);
  });
