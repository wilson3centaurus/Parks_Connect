import { getDb } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';

const ASSIGNABLE_ROLES = new Set(['tourism_operator', 'environment_officer', 'authority_admin']);
const VALID_COMPARATORS = new Set(['>', '>=', '<', '<=']);

export async function listParks(_req, res) {
  const db = await getDb();
  const parks = await db.all(`SELECT * FROM parks ORDER BY name ASC`);
  res.json(parks);
}

export async function getAssigned(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const parkIds = await getAssignedParkIds(req.user);
  if (!parkIds.length && role !== 'authority_admin') return res.json([]);
  const parks = await db.all(
    `SELECT * FROM parks ${parkIds.length && role !== 'authority_admin' ? `WHERE id IN (${parkIds.map(() => '?').join(',')})` : ''} ORDER BY name ASC`,
    parkIds.length && role !== 'authority_admin' ? parkIds : []
  );
  res.json(parks);
}

export async function listAssignments(_req, res) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT pa.id, pa.role, u.id as user_id, u.name as user_name, u.email, u.role as user_role, p.id as park_id, p.name as park_name
     FROM park_assignments pa
     LEFT JOIN users u ON u.id = pa.user_id
     LEFT JOIN parks p ON p.id = pa.park_id
     ORDER BY p.name, u.name`
  );
  res.json(rows);
}

export async function assignPark(req, res) {
  const { user_id: userId, park_id: parkIdRaw, role: roleRaw } = req.body;
  if (!userId || !parkIdRaw) return res.status(400).json({ message: 'user_id and park_id are required' });

  const db = await getDb();
  const parkId = await resolveParkId(req.user, Number(parkIdRaw), { allowFallbackToFirstPark: false });
  if (!parkId) return res.status(400).json({ message: 'Invalid park' });

  const user = await db.get(`SELECT id, role FROM users WHERE id = ?`, [userId]);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const role = normalizeRole(roleRaw || user.role);
  if (!ASSIGNABLE_ROLES.has(role)) {
    return res.status(400).json({ message: 'Invalid assignment role' });
  }

  const existing = await db.get(`SELECT id FROM park_assignments WHERE user_id = ? AND park_id = ?`, [userId, parkId]);
  if (existing) {
    await db.run(`UPDATE park_assignments SET role = ? WHERE id = ?`, [role, existing.id]);
    return res.json({ message: 'updated', id: existing.id });
  }

  const result = await db.run(
    `INSERT INTO park_assignments (user_id, park_id, role) VALUES (?, ?, ?)`,
    [userId, parkId, role]
  );
  res.status(201).json({ message: 'created', id: result.lastID });
}

export async function upsertThreshold(req, res) {
  const { metric, threshold, comparator = '>' } = req.body;
  const parkId = await resolveParkId(req.user, Number(req.body.park_id), { allowFallbackToFirstPark: false });

  if (!metric || threshold === undefined) {
    return res.status(400).json({ message: 'metric and threshold required' });
  }
  if (!VALID_COMPARATORS.has(comparator)) {
    return res.status(400).json({ message: 'Invalid comparator' });
  }

  const db = await getDb();
  const existing = await db.get(
    `SELECT id FROM alert_thresholds WHERE metric = ? AND (${parkId ? 'park_id = ?' : 'park_id IS NULL'})`,
    parkId ? [metric, parkId] : [metric]
  );

  if (existing) {
    await db.run(
      `UPDATE alert_thresholds SET threshold = ?, comparator = ? WHERE id = ?`,
      [Number(threshold), comparator, existing.id]
    );
    return res.json({ message: 'updated' });
  }

  await db.run(
    `INSERT INTO alert_thresholds (metric, threshold, comparator, park_id) VALUES (?, ?, ?, ?)`,
    [metric, Number(threshold), comparator, parkId || null]
  );
  res.status(201).json({ message: 'created' });
}

export async function listThresholds(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const queryParkId = req.query.park_id ? Number(req.query.park_id) : null;
  const parkId = role === 'authority_admin'
    ? queryParkId
    : await resolveParkId(req.user, queryParkId, { allowFallbackToFirstPark: false });

  const rows = await db.all(
    `SELECT * FROM alert_thresholds ${parkId ? 'WHERE park_id = ? OR park_id IS NULL' : 'WHERE park_id IS NULL'} ORDER BY park_id DESC`,
    parkId ? [parkId] : []
  );

  res.json(rows);
}
