import { getDb } from './db.js';

const ROLE_MAP = {
  admin: 'authority_admin',
  staff: 'environment_officer',
  operator: 'tourism_operator'
};

const PARK_LOCKED_ROLES = new Set(['tourism_operator', 'environment_officer']);

export function normalizeRole(role) {
  if (!role) return role;
  return ROLE_MAP[role] || role;
}

export async function getAssignedParkIds(user) {
  const db = await getDb();
  if (!user) return [];

  const role = normalizeRole(user.role);
  if (role === 'authority_admin') {
    const parks = await db.all(`SELECT id FROM parks ORDER BY id ASC`);
    return parks.map((p) => p.id);
  }

  const rows = await db.all(`SELECT park_id FROM park_assignments WHERE user_id = ? ORDER BY id ASC`, [user.id]);
  return rows.map((r) => r.park_id);
}

export async function getPrimaryParkId(user) {
  const ids = await getAssignedParkIds(user);
  return ids[0] || null;
}

export async function resolveParkId(user, requestedParkId, options = {}) {
  const db = await getDb();
  const { allowFallbackToFirstPark = true } = options;
  const parsedRequested = requestedParkId ? Number(requestedParkId) : null;

  if (user) {
    const role = normalizeRole(user.role);

    if (PARK_LOCKED_ROLES.has(role)) {
      const lockedParkId = await getPrimaryParkId(user);
      return lockedParkId || null;
    }

    if (role === 'authority_admin') {
      if (!parsedRequested) return null;
      const park = await db.get(`SELECT id FROM parks WHERE id = ?`, [parsedRequested]);
      return park ? parsedRequested : null;
    }

    if (parsedRequested) {
      const allowed = await getAssignedParkIds(user);
      return allowed.includes(parsedRequested) ? parsedRequested : null;
    }

    return getPrimaryParkId(user);
  }

  if (parsedRequested) {
    const park = await db.get(`SELECT id FROM parks WHERE id = ?`, [parsedRequested]);
    if (park) return parsedRequested;
  }

  if (!allowFallbackToFirstPark) {
    return null;
  }

  const firstPark = await db.get(`SELECT id FROM parks ORDER BY id ASC LIMIT 1`);
  return firstPark?.id || null;
}
