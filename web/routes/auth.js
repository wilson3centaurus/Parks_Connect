import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const mode = req.query.mode === 'register' ? 'register' : 'login';
  res.render('login', { error: null, mode });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const resp = await axios.post(`${backendUrl}/api/auth/login`, { email, password });
    await regenerateSession(req);
    req.session.user = resp.data.user;
    req.session.token = resp.data.token;

    const role = req.session.user?.role;
    if (!['authority_admin', 'environment_officer', 'tourism_operator'].includes(role)) {
      req.session.destroy(() => {});
      return res.status(403).render('login', {
        error: 'This account is mobile-only. Use the Parks Connect mobile app.',
        mode: 'login'
      });
    }

    return res.redirect(resp.data.redirect || '/dashboard');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(401).render('login', { error: 'Invalid credentials', mode: 'login' });
  }
});

router.post('/register', async (req, res) => {
  const { name, email, password, role, it_admin_key, park_id } = req.body;
  try {
    const payload = {
      name,
      email,
      password,
      role,
      it_admin_key,
      park_id: park_id || null
    };
    const resp = await axios.post(`${backendUrl}/api/auth/self-register`, payload);

    await regenerateSession(req);
    req.session.user = resp.data.user;
    req.session.token = resp.data.token;
    res.redirect(resp.data.redirect || '/dashboard');
  } catch (err) {
    console.error(err.response?.data || err.message);
    const message = err.response?.data?.message || 'Registration failed';
    res.status(400).render('login', { error: message, mode: 'register' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('parks_connect.sid');
    res.redirect('/login');
  });
});

export default router;
