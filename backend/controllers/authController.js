import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getDb } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const IT_ADMIN_KEY = process.env.IT_ADMIN_KEY || 'dev_it_admin_key';
const ALLOWED_ROLES = ['authority_admin', 'environment_officer', 'tourism_operator', 'tourist'];
const WEB_PORTAL_ROLES = ['authority_admin', 'environment_officer', 'tourism_operator'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapIncomingRole(role, fallback = 'tourism_operator') {
  if (!role) return fallback;
  return normalizeRole(String(role).trim().toLowerCase());
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function roleRedirect(role) {
  if (role === 'authority_admin') return '/dashboard?portal=authority';
  if (role === 'environment_officer') return '/dashboard?portal=environment';
  if (role === 'tourism_operator') return '/dashboard?portal=tourism';
  return '/mobile';
}

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasLetter && hasNumber;
}

export async function register(req, res) {
  const { name, email, password, role: rawRole, park_id: requestedParkId } = req.body;
  const role = mapIncomingRole(rawRole, 'tourism_operator');

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  const db = await getDb();
  const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const parkId = await resolveParkId(req.user, Number(requestedParkId), { allowFallbackToFirstPark: false });
  if (['tourism_operator', 'environment_officer'].includes(role) && !parkId) {
    return res.status(400).json({ message: 'park_id is required for tourism operators and environment officers' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const result = await db.run(
    `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
    [name, email, hashed, role]
  );

  if (parkId) {
    await db.run(
      `INSERT INTO park_assignments (user_id, park_id, role) VALUES (?, ?, ?)`,
      [result.lastID, parkId, role === 'tourist' ? 'tourism_operator' : role]
    );
  }

  const parks = parkId ? [parkId] : [];
  const user = { id: result.lastID, name, email, role, parks };
  const token = signToken(user);
  return res.status(201).json({ user, token, redirect: roleRedirect(role) });
}

export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Missing credentials' });
  }

  const db = await getDb();
  const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const role = normalizeRole(user.role);
  if (role === 'tourist') {
    return res.status(403).json({ message: 'Tourist accounts are mobile-only. Use the mobile endpoints.' });
  }

  const normalizedUser = { ...user, role };
  const parks = await getAssignedParkIds(normalizedUser);
  const token = signToken({ ...normalizedUser, parks });
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role, parks },
    token,
    redirect: roleRedirect(role)
  });
}

export async function me(req, res) {
  const role = normalizeRole(req.user?.role);
  const user = { ...req.user, role };
  const parks = await getAssignedParkIds(user);
  return res.json({ user: { ...user, parks }, redirect: roleRedirect(role) });
}

export async function selfRegister(req, res) {
  const { name, email, password, role: rawRole, park_id: requestedParkId, it_admin_key: adminKey } = req.body;
  const role = mapIncomingRole(rawRole, 'tourism_operator');

  if (!adminKey || adminKey !== IT_ADMIN_KEY) {
    return res.status(403).json({ message: 'Invalid admin key' });
  }
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  if (!ALLOWED_ROLES.includes(role) || role === 'tourist') {
    return res.status(400).json({ message: 'Invalid role for self registration' });
  }

  const db = await getDb();
  const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const parkId = await resolveParkId(null, Number(requestedParkId), { allowFallbackToFirstPark: false });
  if (['tourism_operator', 'environment_officer'].includes(role) && !parkId) {
    return res.status(400).json({ message: 'park_id is required for tourism operators and environment officers' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const result = await db.run(
    `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
    [name, email, hashed, role]
  );

  if (parkId) {
    await db.run(
      `INSERT INTO park_assignments (user_id, park_id, role) VALUES (?, ?, ?)`,
      [result.lastID, parkId, role]
    );
  }

  const user = { id: result.lastID, name, email, role };
  const parks = await getAssignedParkIds(user);
  const token = signToken({ ...user, parks });
  return res.status(201).json({ user: { ...user, parks }, token, redirect: roleRedirect(role) });
}

export async function forgotPassword(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const newPassword = String(req.body?.new_password || '');
  const confirmPassword = String(req.body?.confirm_password || '');
  const adminKey = String(req.body?.it_admin_key || '');

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Provide a valid email address.' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include letters and numbers.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'Password confirmation does not match.' });
  }
  if (!adminKey || adminKey !== IT_ADMIN_KEY) {
    return res.status(403).json({ message: 'Invalid admin key' });
  }

  const db = await getDb();
  const user = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (!user) {
    return res.status(404).json({ message: 'No account found for this email.' });
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, user.id]);
  return res.json({ message: 'Password updated successfully.' });
}

export function isWebPortalRole(role) {
  return WEB_PORTAL_ROLES.includes(normalizeRole(role));
}
