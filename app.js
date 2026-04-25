const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');

dotenv.config();

const pool = require('./config/db');
const { scheduleAlertMonitoring } = require('./config/cron');
const notificationModel = require('./models/notificationModel');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const wildlifeRoutes = require('./routes/wildlifeRoutes');
const environmentRoutes = require('./routes/environmentRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const alertRoutes = require('./routes/alertRoutes');
const infrastructureRoutes = require('./routes/infrastructureRoutes');

class MySQLSessionStore extends session.Store {
  constructor(dbPool) {
    super();
    this.pool = dbPool;
  }

  async get(sid, callback) {
    try {
      const [rows] = await this.pool.query(
        'SELECT sess FROM sessions WHERE sid = ? AND expires > NOW() LIMIT 1',
        [sid]
      );

      if (!rows.length) {
        return callback(null, null);
      }

      return callback(null, JSON.parse(rows[0].sess));
    } catch (error) {
      return callback(error);
    }
  }

  async set(sid, sessionData, callback = () => {}) {
    try {
      const expiresAt = sessionData?.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.pool.query(
        `INSERT INTO sessions (sid, sess, expires)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE sess = VALUES(sess), expires = VALUES(expires)`,
        [sid, JSON.stringify(sessionData), expiresAt]
      );

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async destroy(sid, callback = () => {}) {
    try {
      await this.pool.query('DELETE FROM sessions WHERE sid = ?', [sid]);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async touch(sid, sessionData, callback = () => {}) {
    try {
      const expiresAt = sessionData?.cookie?.expires
        ? new Date(sessionData.cookie.expires)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.pool.query('UPDATE sessions SET expires = ? WHERE sid = ?', [expiresAt, sid]);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  async cleanupExpired() {
    await this.pool.query('DELETE FROM sessions WHERE expires <= NOW()');
  }
}

const app = express();
const port = Number(process.env.PORT || process.env.WEB_PORT || 3000);
const wildlifeUploadDir = path.join(__dirname, 'public', 'uploads', 'wildlife');

if (!fs.existsSync(wildlifeUploadDir)) {
  fs.mkdirSync(wildlifeUploadDir, { recursive: true });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessionStore = new MySQLSessionStore(pool);
setInterval(() => {
  sessionStore.cleanupExpired().catch((error) => console.error('Session cleanup failed:', error.message));
}, 60 * 60 * 1000);

app.use(
  session({
    name: 'zimparks.sid',
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(async (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  res.locals.unreadNotificationCount = 0;
  res.locals.recentNotifications = [];
  res.locals.title = 'ZimParks Platform';
  res.locals.year = new Date().getFullYear();
  res.locals.formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-ZW', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!req.session.user) {
    return next();
  }

  try {
    const [unreadCount, recentNotifications] = await Promise.all([
      notificationModel.countUnread(req.session.user.id),
      notificationModel.getRecentForUser(req.session.user.id, 5)
    ]);

    res.locals.unreadNotificationCount = unreadCount;
    res.locals.recentNotifications = recentNotifications;
    return next();
  } catch (error) {
    console.error('Notification preload failed:', error.message);
    return next();
  }
});

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/login');
});

app.use(authRoutes);
app.use(adminRoutes);
app.use(wildlifeRoutes);
app.use(environmentRoutes);
app.use(feedbackRoutes);
app.use(analyticsRoutes);
app.use(alertRoutes);
app.use(infrastructureRoutes);

app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Route not found.' });
  }

  if (req.session.user) {
    return res.status(404).render('layout', {
      title: 'Page Not Found',
      view: 'error',
      embedded: true,
      pageScripts: [],
      includeChartJs: false,
      message: 'The requested page could not be found.'
    });
  }

  return res.status(404).render('error', {
    title: 'Page Not Found',
    embedded: false,
    message: 'The requested page could not be found.'
  });
});

app.use((error, req, res, next) => {
  console.error(error.stack || error);
  const message = 'An unexpected error occurred. Please try again shortly.';

  if (req.originalUrl.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(500).json({ success: false, message });
  }

  if (req.session.user) {
    return res.status(500).render('layout', {
      title: 'Server Error',
      view: 'error',
      embedded: true,
      pageScripts: [],
      includeChartJs: false,
      message
    });
  }

  return res.status(500).render('error', {
    title: 'Server Error',
    embedded: false,
    message
  });
});

const REQUIRED_TABLES = [
  'users', 'sessions', 'otp_verifications', 'parks', 'wildlife_sightings',
  'environmental_readings', 'tourist_feedback', 'infrastructure', 'alerts',
  'alert_recipients', 'activity_logs', 'notifications', 'user_parks', 'park_visitor_logs'
];

async function startServer() {
  try {
    await pool.query('SELECT 1');

    const [tableRows] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => '?').join(',')})`,
      REQUIRED_TABLES
    );
    const existing = new Set(tableRows.map((r) => r.TABLE_NAME));
    const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
    if (missing.length) {
      console.error(`[STARTUP] Missing DB tables: ${missing.join(', ')}`);
      console.error('[STARTUP] Run schema.sql against your database to create them.');
      process.exit(1);
    }

    scheduleAlertMonitoring();
    app.listen(port, () => {
      console.log(`ZimParks platform running on port ${port}`);
    });
  } catch (error) {
    console.error('Unable to start application:', error.message);
    process.exit(1);
  }
}

startServer();
