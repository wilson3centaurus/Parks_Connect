import { getDb, supabase } from '../utils/db.js';
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

export async function getParkDetail(req, res) {
  const db = await getDb();
  const parkId = Number(req.params.id);
  if (!parkId) return res.status(400).json({ message: 'Invalid park ID' });

  const park = await db.get(`SELECT * FROM parks WHERE id = ?`, [parkId]);
  if (!park) return res.status(404).json({ message: 'Park not found' });

  const [officers, visitorStats, recentLogs] = await Promise.all([
    db.all(
      `SELECT u.id, u.name, u.email, u.role, pa.role AS assignment_role
       FROM park_assignments pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.park_id = ?
       ORDER BY u.name`,
      [parkId]
    ),
    db.get(
      `SELECT
         COUNT(*) AS log_count,
         COALESCE(SUM(visitors_count), 0) AS total_visitors,
         COALESCE(SUM(local_visitors), 0) AS local_visitors,
         COALESCE(SUM(international_visitors), 0) AS international_visitors,
         MAX(log_date) AS last_visit_date
       FROM visitor_logs WHERE park_id = ?`,
      [parkId]
    ),
    db.all(
      `SELECT log_date, visitors_count, local_visitors, international_visitors
       FROM visitor_logs WHERE park_id = ? ORDER BY log_date DESC LIMIT 8`,
      [parkId]
    )
  ]);

  return res.json({ park, officers, visitorStats: visitorStats || {}, recentLogs });
}

export async function uploadParkPhoto(req, res) {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const parkId = Number(req.params.id);
  if (!parkId) return res.status(400).json({ message: 'Invalid park ID' });

  try {
    const db = await getDb();
    const park = await db.get(`SELECT id FROM parks WHERE id = ?`, [parkId]);
    if (!park) return res.status(404).json({ message: 'Park not found' });

    const ext = (req.file.mimetype || 'image/jpeg').split('/')[1] || 'jpg';
    const fileName = `parks/${parkId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(process.env.STORAGE_BUCKET || 'avatars')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(process.env.STORAGE_BUCKET || 'avatars')
      .getPublicUrl(fileName);

    const photoUrl = urlData.publicUrl;
    await db.run(`UPDATE parks SET photo_url = ? WHERE id = ?`, [photoUrl, parkId]);

    return res.json({ photo_url: photoUrl });
  } catch (err) {
    console.error('[park photo]', err.message);
    return res.status(500).json({ message: 'Upload failed' });
  }
}

export async function clearParkPhoto(req, res) {
  const parkId = Number(req.params.id);
  if (!parkId) return res.status(400).json({ message: 'Invalid park ID' });
  try {
    const db = await getDb();
    await db.run(`UPDATE parks SET photo_url = NULL WHERE id = ?`, [parkId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[park photo clear]', err.message);
    return res.status(500).json({ message: 'Failed to remove photo' });
  }
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
