const pool = require('../config/db');

function buildParkFilter(parkIds, column = 'a.park_id') {
  if (parkIds === null) {
    return { clause: '', params: [] };
  }

  if (!parkIds || !parkIds.length) {
    return { clause: ' AND 1 = 0', params: [] };
  }

  return { clause: ` AND ${column} IN (?)`, params: [parkIds] };
}

async function createAlert({ parkId, type, severity, title, description, triggeredBy, createdBy }) {
  const [result] = await pool.query(
    `INSERT INTO alerts (park_id, type, severity, title, description, triggered_by, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [parkId, type, severity, title, description, triggeredBy, createdBy || null]
  );

  return result.insertId;
}

async function findExistingActive({ parkId, type, title }) {
  const [rows] = await pool.query(
    `SELECT id
     FROM alerts
     WHERE park_id = ?
       AND type = ?
       AND title = ?
       AND status IN ('active', 'acknowledged')
     ORDER BY created_at DESC
     LIMIT 1`,
    [parkId, type, title]
  );

  return rows[0] || null;
}

async function insertRecipients(alertId, recipients) {
  if (!recipients.length) {
    return;
  }

  const values = recipients.map((recipient) => [alertId, recipient.userId, recipient.notifiedVia]);
  await pool.query(
    'INSERT IGNORE INTO alert_recipients (alert_id, user_id, notified_via) VALUES ?',
    [values]
  );
}

async function listAlerts({ page, limit, status, severity, type, parkIds }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const filter = buildParkFilter(parkIds);

  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }

  if (severity) {
    conditions.push('a.severity = ?');
    params.push(severity);
  }

  if (type) {
    conditions.push('a.type = ?');
    params.push(type);
  }

  const additional = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM alerts a WHERE 1 = 1 ${filter.clause}${additional}`,
    [...filter.params, ...params]
  );

  const [rows] = await pool.query(
    `SELECT
       a.*,
       p.name AS park_name,
       CONCAT(u.first_name, ' ', u.surname) AS created_by_name
     FROM alerts a
     INNER JOIN parks p ON p.id = a.park_id
     LEFT JOIN users u ON u.id = a.created_by
     WHERE 1 = 1 ${filter.clause}${additional}
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [...filter.params, ...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function countActive(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM alerts a WHERE a.status = 'active' ${filter.clause}`,
    filter.params
  );

  return rows[0].total;
}

async function getRecentActive(parkIds, limit = 5) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT a.*, p.name AS park_name
     FROM alerts a
     INNER JOIN parks p ON p.id = a.park_id
     WHERE a.status IN ('active', 'acknowledged') ${filter.clause}
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [...filter.params, limit]
  );

  return rows;
}

async function acknowledgeAlert(id) {
  await pool.query(
    `UPDATE alerts
     SET status = 'acknowledged'
     WHERE id = ? AND status = 'active'`,
    [id]
  );
}

async function resolveAlert(id) {
  await pool.query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = NOW()
     WHERE id = ? AND status IN ('active', 'acknowledged')`,
    [id]
  );
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM alerts WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function getAlertsByTypeAndSeverity(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT a.type, a.severity, COUNT(*) AS total
     FROM alerts a
     WHERE 1 = 1 ${filter.clause}
     GROUP BY a.type, a.severity
     ORDER BY a.type ASC, a.severity ASC`,
    filter.params
  );

  return rows;
}

module.exports = {
  createAlert,
  findExistingActive,
  insertRecipients,
  listAlerts,
  countActive,
  getRecentActive,
  acknowledgeAlert,
  resolveAlert,
  getById,
  getAlertsByTypeAndSeverity
};
