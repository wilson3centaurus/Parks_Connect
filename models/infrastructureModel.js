const pool = require('../config/db');

function buildParkFilter(parkIds, column = 'i.park_id') {
  if (parkIds === null) {
    return { clause: '', params: [] };
  }

  if (!parkIds || !parkIds.length) {
    return { clause: ' AND 1 = 0', params: [] };
  }

  return { clause: ` AND ${column} IN (?)`, params: [parkIds] };
}

async function createReport({ parkId, name, type, status, lastInspected, reportedBy, notes }) {
  const [result] = await pool.query(
    `INSERT INTO infrastructure (park_id, name, type, status, last_inspected, reported_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [parkId, name, type, status, lastInspected || null, reportedBy, notes || null]
  );

  return result.insertId;
}

async function listReports({ page, limit, parkId, status, type, parkIds }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const filter = buildParkFilter(parkIds);

  if (parkId) {
    conditions.push('i.park_id = ?');
    params.push(parkId);
  }

  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }

  if (type) {
    conditions.push('i.type = ?');
    params.push(type);
  }

  const additional = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM infrastructure i WHERE 1 = 1 ${filter.clause}${additional}`,
    [...filter.params, ...params]
  );

  const [rows] = await pool.query(
    `SELECT
       i.*,
       p.name AS park_name,
       CONCAT(u.first_name, ' ', u.surname) AS reported_by_name
     FROM infrastructure i
     INNER JOIN parks p ON p.id = i.park_id
     INNER JOIN users u ON u.id = i.reported_by
     WHERE 1 = 1 ${filter.clause}${additional}
     ORDER BY i.created_at DESC
     LIMIT ? OFFSET ?`,
    [...filter.params, ...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function getStatusBreakdown(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT i.status, COUNT(*) AS total
     FROM infrastructure i
     WHERE 1 = 1 ${filter.clause}
     GROUP BY i.status
     ORDER BY i.status ASC`,
    filter.params
  );

  return rows;
}

async function countIssues(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM infrastructure i
     WHERE i.status IN ('needs_maintenance', 'failed') ${filter.clause}`,
    filter.params
  );

  return rows[0].total;
}

async function getIssuesForDashboard(parkIds, limit = 5) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT i.*, p.name AS park_name
     FROM infrastructure i
     INNER JOIN parks p ON p.id = i.park_id
     WHERE i.status IN ('needs_maintenance', 'failed') ${filter.clause}
     ORDER BY i.created_at DESC
     LIMIT ?`,
    [...filter.params, limit]
  );

  return rows;
}

async function getRecentFailedReports() {
  const [rows] = await pool.query(
    `SELECT i.*, p.name AS park_name
     FROM infrastructure i
     INNER JOIN parks p ON p.id = i.park_id
     WHERE i.status = 'failed'
       AND i.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`
  );

  return rows;
}

module.exports = {
  createReport,
  listReports,
  getStatusBreakdown,
  countIssues,
  getIssuesForDashboard,
  getRecentFailedReports
};
