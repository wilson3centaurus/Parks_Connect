import { getDb } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole } from '../utils/parks.js';

export async function listNotifications(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const allowedParks = await getAssignedParkIds(req.user);
  const filters = [];
  const params = [];
  const { resolved } = req.query;

  if (role !== 'authority_admin') {
    if (allowedParks.length === 0) return res.json([]);
    filters.push(`(park_id IS NULL OR park_id IN (${allowedParks.map(() => '?').join(',')}))`);
    params.push(...allowedParks);
  }

  if (resolved === 'false') {
    filters.push(`status != 'resolved'`);
  } else if (resolved === 'true') {
    filters.push(`status = 'resolved'`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.all(
    `SELECT
      id,
      park_id,
      alert_type as type,
      message,
      severity,
      status,
      CASE WHEN status = 'resolved' THEN 1 ELSE 0 END AS resolved,
      created_at,
      due_at,
      escalated_at
     FROM alerts
     ${whereClause}
     ORDER BY (status = 'resolved') ASC, created_at DESC`,
    params
  );

  res.json(rows);
}

export async function resolveNotification(req, res) {
  const { id } = req.params;
  const db = await getDb();
  const note = await db.get(`SELECT park_id FROM alerts WHERE id = ?`, [id]);
  if (!note) return res.status(404).json({ message: 'Not found' });

  if (normalizeRole(req.user.role) !== 'authority_admin') {
    const allowed = await getAssignedParkIds(req.user);
    if (note.park_id && !allowed.includes(note.park_id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  await db.run(`UPDATE alerts SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  res.json({ message: 'resolved' });
}
