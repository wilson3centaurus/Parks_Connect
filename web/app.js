import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import expressLayouts from 'express-ejs-layouts';
import morgan from 'morgan';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';

dotenv.config();

const app = express();
const port = process.env.WEB_PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQLiteStore = connectSqlite3(session);
const sessionStoreDir = process.env.SESSION_STORE_DIR || path.join(__dirname, 'data');

if (!fs.existsSync(sessionStoreDir)) {
  fs.mkdirSync(sessionStoreDir, { recursive: true });
}

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
  session({
    name: 'parks_connect.sid',
    store: new SQLiteStore({
      dir: sessionStoreDir,
      db: process.env.SESSION_STORE_DB || 'sessions.db',
      table: 'sessions',
      ttl: Math.floor(sessionMaxAge / 1000)
    }),
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionMaxAge,
      sameSite: 'lax'
    }
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

app.get('/', (_req, res) => res.redirect('/dashboard'));

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Something went wrong.' });
});

app.listen(port, () => {
  console.log(`Web app running on port ${port}`);
  logServerAddresses(port);
});
