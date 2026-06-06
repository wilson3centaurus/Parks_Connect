import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
const ROLES = new Set(['authority_admin', 'environment_officer', 'tourism_operator']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function establishSession(req, user, token) {
  req.session = {
    user,
    token,
    issuedAt: Date.now()
  };
}

function normalizeMode(mode) {
  if (mode === 'register' || mode === 'forgot') return mode;
  return 'login';
}

function renderAuth(res, statusCode, { mode = 'login', error = null, success = null }) {
  return res.status(statusCode).render('login', {
    error,
    success,
    mode: normalizeMode(mode),
    layout: false
  });
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(String(email || '').trim().toLowerCase());
}

function isStrongPassword(password) {
  const value = String(password || '');
  if (value.length < 8) return false;
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  const mode = normalizeMode(String(req.query.mode || 'login'));
  renderAuth(res, 200, { mode });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!isValidEmail(email)) {
    return renderAuth(res, 400, { mode: 'login', error: 'Enter a valid email address.' });
  }
  if (!password) {
    return renderAuth(res, 400, { mode: 'login', error: 'Password is required.' });
  }
  try {
    const resp = await axios.post(`${backendUrl}/api/auth/login`, { email, password });
    establishSession(req, resp.data.user, resp.data.token);

    const role = req.session.user?.role;
    if (!['authority_admin', 'environment_officer', 'tourism_operator'].includes(role)) {
      req.session = null;
      return renderAuth(res, 403, {
        mode: 'login',
        error: 'This account is mobile-only. Use the Parks Connect mobile app.'
      });
    }

    return res.redirect(resp.data.redirect || '/dashboard');
  } catch (err) {
    console.error(err.response?.data || err.message);
    renderAuth(res, 401, { mode: 'login', error: 'Invalid credentials' });
  }
});

router.post('/register', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirm_password || '');
  const role = String(req.body?.role || '').trim();
  const itAdminKey = String(req.body?.it_admin_key || '').trim();
  const parkIdRaw = String(req.body?.park_id || '').trim();
  const parkId = parkIdRaw ? Number(parkIdRaw) : null;

  if (name.length < 2) {
    return renderAuth(res, 400, { mode: 'register', error: 'Full name must be at least 2 characters.' });
  }
  if (!isValidEmail(email)) {
    return renderAuth(res, 400, { mode: 'register', error: 'Enter a valid email address.' });
  }
  if (!ROLES.has(role)) {
    return renderAuth(res, 400, { mode: 'register', error: 'Select a valid role.' });
  }
  if (!isStrongPassword(password)) {
    return renderAuth(res, 400, { mode: 'register', error: 'Password must be at least 8 characters and include letters and numbers.' });
  }
  if (password !== confirmPassword) {
    return renderAuth(res, 400, { mode: 'register', error: 'Password confirmation does not match.' });
  }
  if (!itAdminKey) {
    return renderAuth(res, 400, { mode: 'register', error: 'IT admin key is required.' });
  }
  if ((role === 'environment_officer' || role === 'tourism_operator') && (!Number.isInteger(parkId) || parkId < 1)) {
    return renderAuth(res, 400, { mode: 'register', error: 'Park ID is required for officer/operator accounts.' });
  }

  try {
    const payload = {
      name,
      email,
      password,
      role,
      it_admin_key: itAdminKey,
      park_id: parkId
    };
    const resp = await axios.post(`${backendUrl}/api/auth/self-register`, payload);

    establishSession(req, resp.data.user, resp.data.token);
    res.redirect(resp.data.redirect || '/dashboard');
  } catch (err) {
    console.error(err.response?.data || err.message);
    const message = err.response?.data?.message || 'Registration failed';
    renderAuth(res, 400, { error: message, mode: 'register' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const newPassword = String(req.body?.new_password || '');
  const confirmPassword = String(req.body?.confirm_password || '');
  const itAdminKey = String(req.body?.it_admin_key || '').trim();

  if (!isValidEmail(email)) {
    return renderAuth(res, 400, { mode: 'forgot', error: 'Enter a valid email address.' });
  }
  if (!isStrongPassword(newPassword)) {
    return renderAuth(res, 400, { mode: 'forgot', error: 'Password must be at least 8 characters and include letters and numbers.' });
  }
  if (newPassword !== confirmPassword) {
    return renderAuth(res, 400, { mode: 'forgot', error: 'Password confirmation does not match.' });
  }
  if (!itAdminKey) {
    return renderAuth(res, 400, { mode: 'forgot', error: 'IT admin key is required.' });
  }

  try {
    await axios.post(`${backendUrl}/api/auth/forgot-password`, {
      email,
      new_password: newPassword,
      confirm_password: confirmPassword,
      it_admin_key: itAdminKey
    });
    return renderAuth(res, 200, {
      mode: 'login',
      success: 'Password updated. You can now sign in with the new password.'
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    const message = err.response?.data?.message || 'Password reset failed';
    return renderAuth(res, 400, { mode: 'forgot', error: message });
  }
});

router.get('/logout', (req, res) => {
  req.session = null;
  res.clearCookie('parks_connect.sid');
  res.redirect('/login');
});

export default router;
