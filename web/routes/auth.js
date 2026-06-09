import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_ROLES = new Set(['authority_admin', 'environment_officer', 'tourism_operator']);

function establishSession(req, user, token) {
  req.session = { user, token, issuedAt: Date.now() };
}

function isXhr(req) {
  return req.headers['x-requested-with'] === 'XMLHttpRequest';
}

router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.render('login', { error: null, success: null, layout: false });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const xhr = isXhr(req);

  if (!EMAIL_REGEX.test(email)) {
    return xhr
      ? res.status(400).json({ message: 'Enter a valid email address.' })
      : res.status(400).render('login', { error: 'Enter a valid email address.', success: null, layout: false });
  }
  if (!password) {
    return xhr
      ? res.status(400).json({ message: 'Password is required.' })
      : res.status(400).render('login', { error: 'Password is required.', success: null, layout: false });
  }

  try {
    const resp = await axios.post(`${backendUrl}/api/auth/login`, { email, password });
    const { user, token, redirect } = resp.data;
    const role = user?.role;

    if (!WEB_ROLES.has(role)) {
      return xhr
        ? res.status(403).json({ message: 'This account type cannot access the web portal. Use the mobile app instead.' })
        : res.status(403).render('login', { error: 'This account type cannot access the web portal.', success: null, layout: false });
    }

    establishSession(req, user, token);

    return xhr
      ? res.json({ redirect: redirect || '/dashboard' })
      : res.redirect(redirect || '/dashboard');

  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || (status >= 500 ? 'Server error — please try again.' : 'Incorrect email or password.');
    console.error('[login]', status, message);

    return xhr
      ? res.status(status).json({ message })
      : res.status(status).render('login', { error: message, success: null, layout: false });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.clearCookie('parks_connect.sid');
  res.redirect('/');
});

export default router;
