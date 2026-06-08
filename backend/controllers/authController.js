import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getDb, supabase, supabaseAnon } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const ALLOWED_ROLES = ['authority_admin', 'environment_officer', 'tourism_operator'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapIncomingRole(role, fallback = 'tourism_operator') {
  if (!role) return fallback;
  return normalizeRole(String(role).trim().toLowerCase());
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      is_supabase_admin: user.is_supabase_admin || false
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function roleRedirect(role) {
  if (role === 'authority_admin') return '/dashboard?portal=authority';
  if (role === 'environment_officer') return '/dashboard?portal=environment';
  if (role === 'tourism_operator') return '/dashboard?portal=tourism';
  return '/';
}

function isStrongPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return false;
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

// ── Login ────────────────────────────────────────────────────────────────────
// 1. Try parks_connect.users (staff bcrypt)
// 2. Fallback: try Supabase Auth (superadmin account created directly in Supabase)
export async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Missing credentials' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const db = await getDb();

  // Path 1: staff account in parks_connect.users
  const user = await db.get(`SELECT * FROM users WHERE email = ?`, [normalizedEmail]);
  if (user) {
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const role = normalizeRole(user.role);
    const parks = await getAssignedParkIds({ ...user, role });
    const token = signToken({ ...user, role, parks });
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role, parks },
      token,
      redirect: roleRedirect(role)
    });
  }

  // Path 2: Supabase Auth superadmin
  // Uses anon key client — signInWithPassword requires anon key, not service_role.
  try {
    let signInData, signInError;

    ({ data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password
    }));

    // Auto-fix: email not confirmed (common when user created via Supabase dashboard).
    // Use admin API to confirm the email then retry once.
    if (signInError && /email.not.confirmed|not confirmed/i.test(signInError.message || '')) {
      console.log('[auth] Email not confirmed for', normalizedEmail, '— auto-confirming via admin API');
      try {
        const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
        const target = (listData?.users || []).find(u => u.email === normalizedEmail);
        if (target) {
          await supabase.auth.admin.updateUserById(target.id, { email_confirm: true });
          ({ data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
            email: normalizedEmail,
            password
          }));
        }
      } catch (confirmErr) {
        console.error('[auth] Auto-confirm failed:', confirmErr.message);
      }
    }

    if (signInError || !signInData?.user) {
      console.error('[auth] Supabase sign-in error:', signInError?.message, signInError?.status);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const adminUser = {
      id: signInData.user.id,
      name: signInData.user.user_metadata?.name || normalizedEmail.split('@')[0],
      email: signInData.user.email,
      role: 'authority_admin',
      parks: [],
      is_supabase_admin: true
    };
    const token = signToken(adminUser);
    return res.json({
      user: { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: 'authority_admin', parks: [] },
      token,
      redirect: roleRedirect('authority_admin')
    });
  } catch (err) {
    console.error('[auth] Supabase sign-in exception:', err.message);
    return res.status(401).json({ message: 'Invalid credentials' });
  }
}

// ── Get current user ─────────────────────────────────────────────────────────
export async function me(req, res) {
  const role = normalizeRole(req.user?.role);
  const user = { ...req.user, role };
  if (!user.is_supabase_admin) {
    const parks = await getAssignedParkIds(user);
    return res.json({ user: { ...user, parks }, redirect: roleRedirect(role) });
  }
  return res.json({ user: { ...user, parks: [] }, redirect: roleRedirect(role) });
}

// ── Register staff account (admin-only, authenticated) ───────────────────────
export async function register(req, res) {
  const { name, email, password, role: rawRole, park_id: requestedParkId } = req.body;
  const role = mapIncomingRole(rawRole, 'tourism_operator');

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters with letters and numbers' });
  }

  const db = await getDb();
  const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [String(email).toLowerCase().trim()]);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const parkId = await resolveParkId(req.user, Number(requestedParkId), { allowFallbackToFirstPark: false });
  if (['tourism_operator', 'environment_officer'].includes(role) && !parkId) {
    return res.status(400).json({ message: 'park_id is required for officers and operators' });
  }

  const hashed = await bcrypt.hash(password, 12);
  const result = await db.run(
    `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
    [String(name).trim(), String(email).toLowerCase().trim(), hashed, role]
  );

  if (parkId) {
    await db.run(
      `INSERT INTO park_assignments (user_id, park_id, role) VALUES (?, ?, ?)`,
      [result.lastID, parkId, role]
    );
  }

  const newUser = { id: result.lastID, name, email, role, parks: parkId ? [parkId] : [] };
  return res.status(201).json({ user: newUser, message: 'Account created' });
}

// ── List all staff users (admin-only) ────────────────────────────────────────
export async function listUsers(req, res) {
  const db = await getDb();
  const users = await db.all(
    `SELECT u.id, u.name, u.email, u.role, u.created_at,
            pa.park_id, p.name AS park_name
     FROM users u
     LEFT JOIN park_assignments pa ON pa.user_id = u.id
     LEFT JOIN parks p ON p.id = pa.park_id
     ORDER BY u.created_at DESC`
  );
  return res.json(users);
}

// ── Delete a staff user (admin-only) ─────────────────────────────────────────
export async function deleteUser(req, res) {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ message: 'Invalid user ID' });

  const db = await getDb();
  const user = await db.get(`SELECT id FROM users WHERE id = ?`, [userId]);
  if (!user) return res.status(404).json({ message: 'User not found' });

  await db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  return res.json({ message: 'User deleted' });
}

// ── Admin resets a staff user's password (admin-only) ────────────────────────
export async function adminResetUserPassword(req, res) {
  const userId = Number(req.params.id);
  const newPassword = String(req.body?.new_password || '');

  if (!userId) return res.status(400).json({ message: 'Invalid user ID' });
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters with letters and numbers' });
  }

  const db = await getDb();
  const user = await db.get(`SELECT id FROM users WHERE id = ?`, [userId]);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId]);
  return res.json({ message: 'Password reset successfully' });
}

// ── Staff changes their own password ─────────────────────────────────────────
export async function changePassword(req, res) {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');

  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: 'New password must be at least 8 characters with letters and numbers' });
  }

  // Supabase admin changes password via Supabase Auth
  if (req.user?.is_supabase_admin) {
    const { error: signInErr } = await supabaseAnon.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword
    });
    if (signInErr) return res.status(401).json({ message: 'Current password is incorrect' });

    const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
    if (error) return res.status(500).json({ message: 'Failed to update password' });
    return res.json({ message: 'Password updated successfully' });
  }

  // Staff changes password in parks_connect.users
  const db = await getDb();
  const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ message: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.run(`UPDATE users SET password = ? WHERE id = ?`, [hashed, req.user.id]);
  return res.json({ message: 'Password updated successfully' });
}

export function isWebPortalRole(role) {
  return ALLOWED_ROLES.includes(normalizeRole(role));
}
