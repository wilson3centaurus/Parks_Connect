import express from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import cookieSession from 'cookie-session';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import expressLayouts from 'express-ejs-layouts';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import publicRoutes from './routes/public.js';

dotenv.config();

const app = express();
const port = process.env.WEB_PORT || 3000;
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

  console.log('Web app ready:');
  console.log(`- Localhost: ${localhostUrl}`);
  if (lanUrls.size > 0) {
    console.log('- LAN / mobile access:');
    lanUrls.forEach((url) => console.log(`  -> ${url}`));
  } else {
    console.log('- LAN / mobile access: no IPv4 address detected');
  }
};

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(
  morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms :remote-addr', {
    stream: process.stdout
  })
);

const sessionMaxAge = Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);
app.use(
  cookieSession({
    name: 'parks_connect.sid',
    keys: [process.env.SESSION_SECRET || 'dev_secret'],
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionMaxAge,
      sameSite: 'lax'
    },
    signed: true
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.currentPath = req.path;
  next();
});

// Serve service worker from root scope
app.get('/sw.js', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'sw.js')));
app.get('/manifest.json', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest.json')));

// Proxy public API calls (tourist page feedback/booking) to backend — no auth required
app.use('/api-proxy', async (req, res) => {
  try {
    const { default: axios } = await import('axios');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    const targetUrl = `${backendUrl}/api${req.path}`;
    const response = await axios({ method: req.method, url: targetUrl, data: req.body, params: req.query, headers: { 'Content-Type': 'application/json' } });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    return res.status(status).json(err.response?.data || { message: 'Proxy error' });
  }
});

app.get('/', async (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  try {
    const { default: axios } = await import('axios');
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
    const parks = await axios.get(`${backendUrl}/api/parks`).then((r) => r.data).catch(() => []);
    return res.render('home', { layout: false, parks });
  } catch {
    return res.render('home', { layout: false, parks: [] });
  }
});

app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Something went wrong.' });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Web app running on port ${port}`);
    logServerAddresses(port);
  });
}

export default app;
