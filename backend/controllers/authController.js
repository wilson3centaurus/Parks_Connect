import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { getDb, supabase, supabaseAnon } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';
import { sendWelcomeEmail } from '../utils/email.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const ALLOWED_ROLES = ['authority_admin', 'environment_officer', 'tourism_operator'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPERSONATE_KEY = process.env.IMPERSONATE_KEY || 'DrnLeeroy';

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
      photo_url: user.photo_url || null,
      first_login: user.first_login ?? false,
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

// ID number → default password: strip spaces, all lowercase
function idToPassword(idNumber) {
  if (!idNumber) return null;
  return String(idNumber).replace(/\s+/g, '').toLowerCase();
}

function isValidPassword(password) {
  // Accept ID-number-style passwords (8+ chars) OR the strict format
  return typeof password === 'string' && password.length >= 6;
}

// ── Login ────────────────────────────────────────────────────────────────────
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
      user: { id: user.id, name: user.name, email: user.email, role, parks, photo_url: user.photo_url || null, first_login: user.first_login ?? true },
      token,
      redirect: roleRedirect(role)
    });
  }

  // Path 2: Supabase Auth superadmin
  try {
    let signInData, signInError;

    ({ data: signInData, error: signInError } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password
    }));

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
      first_login: false,
      is_supabase_admin: true
    };
    const token = signToken(adminUser);
    return res.json({
      user: { id: adminUser.id, name: adminUser.name, email: adminUser.email, role: 'authority_admin', parks: [], first_login: false },
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
  const { name, email, id_number, role: rawRole, park_id: requestedParkId, phone } = req.body;
  const role = mapIncomingRole(rawRole, 'tourism_operator');

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
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

  // Enforce: officer/operator can only be assigned to 1 park
  if (parkId && ['tourism_operator', 'environment_officer'].includes(role)) {
    const alreadyAssigned = await db.get(
      `SELECT pa.id FROM park_assignments pa JOIN users u ON u.id = pa.user_id WHERE u.email = ?`,
      [String(email).toLowerCase().trim()]
    );
    if (alreadyAssigned) {
      return res.status(409).json({ message: 'This officer is already assigned to a park' });
    }
  }

  // Password is ID number without spaces, lowercase — or fallback to a generated one
  const rawPassword = id_number ? idToPassword(id_number) : `zimparks${Date.now()}`;
  const hashed = await bcrypt.hash(rawPassword, 12);

  const result = await db.run(
    `INSERT INTO users (name, email, password, role, id_number, phone, first_login) VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
    [String(name).trim(), String(email).toLowerCase().trim(), hashed, role, id_number || null, phone || null]
  );

  let parkName = null;
  if (parkId) {
    await db.run(
      `INSERT INTO park_assignments (user_id, park_id, role) VALUES (?, ?, ?)`,
      [result.lastID, parkId, role]
    );
    const park = await db.get(`SELECT name FROM parks WHERE id = ?`, [parkId]);
    parkName = park?.name || null;
  }

  // Send welcome email (non-blocking — don't fail registration if email fails)
  try {
    await sendWelcomeEmail({
      to: String(email).toLowerCase().trim(),
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      idNumber: id_number || null,
      role,
      parkName
    });
  } catch (emailErr) {
    console.error('[auth] Welcome email failed:', emailErr.message);
  }

  const newUser = { id: result.lastID, name, email, role, parks: parkId ? [parkId] : [] };
  return res.status(201).json({ user: newUser, message: 'Account created' });
}

// ── List all staff users (admin-only) ────────────────────────────────────────
export async function listUsers(req, res) {
  const db = await getDb();
  const users = await db.all(
    `SELECT u.id, u.name, u.email, u.role, u.id_number, u.phone, u.photo_url, u.first_login, u.created_at,
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

// ── Admin resets user password to their ID number ────────────────────────────
export async function adminResetUserPassword(req, res) {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ message: 'Invalid user ID' });

  const db = await getDb();
  const user = await db.get(`SELECT id, id_number FROM users WHERE id = ?`, [userId]);
  if (!user) return res.status(404).json({ message: 'User not found' });

  // If admin provides a new_password use it, otherwise reset to ID number
  const providedPassword = String(req.body?.new_password || '');
  const resetPassword = providedPassword.length >= 6
    ? providedPassword
    : (user.id_number ? idToPassword(user.id_number) : null);

  if (!resetPassword) {
    return res.status(400).json({ message: 'User has no ID number on file — provide a new_password' });
  }

  const hashed = await bcrypt.hash(resetPassword, 12);
  await db.run(`UPDATE users SET password = ?, first_login = TRUE WHERE id = ?`, [hashed, userId]);
  return res.json({ message: 'Password reset to default (ID number)' });
}

// ── Staff changes their own password ─────────────────────────────────────────
export async function changePassword(req, res) {
  const currentPassword = String(req.body?.current_password || '');
  const newPassword = String(req.body?.new_password || '');

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }

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

  const db = await getDb();
  const user = await db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ message: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(newPassword, 12);
  // Mark first_login = false after they change their own password
  await db.run(`UPDATE users SET password = ?, first_login = FALSE WHERE id = ?`, [hashed, req.user.id]);
  return res.json({ message: 'Password updated successfully' });
}

// ── Mark first login complete ────────────────────────────────────────────────
export async function completeOnboarding(req, res) {
  if (req.user?.is_supabase_admin) return res.json({ ok: true });
  const db = await getDb();
  await db.run(`UPDATE users SET first_login = FALSE WHERE id = ?`, [req.user.id]);
  return res.json({ ok: true });
}

// ── Upload profile photo ─────────────────────────────────────────────────────
export async function uploadPhoto(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const userId = req.user.id;

  try {
    const ext = req.file.mimetype.split('/')[1] || 'jpg';
    const fileName = `avatars/${userId}.${ext}`;

    const { error } = await supabase.storage
      .from(process.env.STORAGE_BUCKET || 'avatars')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(process.env.STORAGE_BUCKET || 'avatars')
      .getPublicUrl(fileName);

    const photoUrl = urlData.publicUrl;

    if (!req.user.is_supabase_admin) {
      const db = await getDb();
      await db.run(`UPDATE users SET photo_url = ? WHERE id = ?`, [photoUrl, userId]);
    }

    return res.json({ photo_url: photoUrl });
  } catch (err) {
    console.error('[photo upload]', err.message);
    return res.status(500).json({ message: 'Upload failed' });
  }
}

// ── Admin impersonation ──────────────────────────────────────────────────────
export async function impersonate(req, res) {
  const { target_user_id, impersonate_key } = req.body;

  if (impersonate_key !== IMPERSONATE_KEY) {
    return res.status(403).json({ message: 'Invalid impersonation key' });
  }
  if (!target_user_id) {
    return res.status(400).json({ message: 'target_user_id required' });
  }

  const db = await getDb();
  const target = await db.get(`SELECT * FROM users WHERE id = ?`, [Number(target_user_id)]);
  if (!target) return res.status(404).json({ message: 'User not found' });

  const role = normalizeRole(target.role);
  const parks = await getAssignedParkIds({ ...target, role });
  const token = signToken({ ...target, role, parks, impersonating_as: target.id, original_admin: req.user.id });

  return res.json({
    user: { id: target.id, name: target.name, email: target.email, role, parks, photo_url: target.photo_url || null },
    token,
    redirect: roleRedirect(role),
    impersonating: true
  });
}

export function isWebPortalRole(role) {
  return ALLOWED_ROLES.includes(normalizeRole(role));
}
