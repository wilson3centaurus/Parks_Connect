const pool = require('../config/db');

function buildParkFilter(parkIds, column = 'p.id') {
  if (parkIds === null) {
    return { clause: '', params: [] };
  }

  if (!parkIds || !parkIds.length) {
    return { clause: ' AND 1 = 0', params: [] };
  }

  return {
    clause: ` AND ${column} IN (?)`,
    params: [parkIds]
  };
}

async function getAccessibleParkIds(userId, role) {
  if (['admin', 'analyst'].includes(role)) {
    return null;
  }

  const [rows] = await pool.query('SELECT park_id FROM user_parks WHERE user_id = ?', [userId]);
  return rows.map((row) => row.park_id);
}

async function getAccessibleParks(userId, role) {
  const parkIds = await getAccessibleParkIds(userId, role);
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT p.*
     FROM parks p
     WHERE 1 = 1 ${filter.clause}
     ORDER BY p.name ASC`,
    filter.params
  );

  return rows;
}

async function hasAccess(userId, role, parkId) {
  if (['admin', 'analyst'].includes(role)) {
    return true;
  }

  const [rows] = await pool.query(
    'SELECT id FROM user_parks WHERE user_id = ? AND park_id = ? LIMIT 1',
    [userId, parkId]
  );

  return rows.length > 0;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM parks WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function createPark({ name, location, region, sizeHectares, capacity, status }) {
  const [result] = await pool.query(
    `INSERT INTO parks (name, location, region, size_hectares, capacity, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, location, region, sizeHectares, capacity, status]
  );

  return result.insertId;
}

async function listParks({ page, limit, search, status }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(name LIKE ? OR location LIKE ? OR region LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM parks ${whereClause}`, params);
  const [rows] = await pool.query(
    `SELECT * FROM parks ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function updateVisitorCount({ parkId, visitors, loggedBy, logDate }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query('UPDATE parks SET current_visitors = ? WHERE id = ?', [visitors, parkId]);
    await connection.query(
      `INSERT INTO park_visitor_logs (park_id, visitors, logged_by, log_date)
       VALUES (?, ?, ?, ?)`,
      [parkId, visitors, loggedBy, logDate]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getVisitorCountPerPark(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.location,
       p.region,
       p.capacity,
       p.current_visitors,
       ROUND((p.current_visitors / NULLIF(p.capacity, 0)) * 100, 2) AS occupancy_percent
     FROM parks p
     WHERE 1 = 1 ${filter.clause}
     ORDER BY p.name ASC`,
    filter.params
  );

  return rows;
}

async function getVisitorTrendsLast30Days(parkIds) {
  const filter = buildParkFilter(parkIds, 'pvl.park_id');
  const [rows] = await pool.query(
    `SELECT
       DATE_FORMAT(pvl.log_date, '%Y-%m-%d') AS label,
       p.name AS park_name,
       SUM(pvl.visitors) AS total_visitors
     FROM park_visitor_logs pvl
     INNER JOIN parks p ON p.id = pvl.park_id
     WHERE pvl.log_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ${filter.clause}
     GROUP BY DATE_FORMAT(pvl.log_date, '%Y-%m-%d'), p.name
     ORDER BY label ASC, park_name ASC`,
    filter.params
  );

  return rows;
}

async function getTotalVisitorsThisMonth(parkIds) {
  const filter = buildParkFilter(parkIds, 'park_id');
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(visitors), 0) AS total
     FROM park_visitor_logs
     WHERE MONTH(log_date) = MONTH(CURDATE())
       AND YEAR(log_date) = YEAR(CURDATE())
       ${filter.clause}`,
    filter.params
  );

  return rows[0].total || 0;
}

async function getParksNearCapacity() {
  const [rows] = await pool.query(
    `SELECT id, name, capacity, current_visitors
     FROM parks
     WHERE capacity > 0
       AND current_visitors >= (capacity * 0.9)
       AND status = 'open'`
  );

  return rows;
}

async function getTotalParks() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM parks');
  return rows[0].total;
}

module.exports = {
  getAccessibleParkIds,
  getAccessibleParks,
  hasAccess,
  getById,
  createPark,
  listParks,
  updateVisitorCount,
  getVisitorCountPerPark,
  getVisitorTrendsLast30Days,
  getTotalVisitorsThisMonth,
  getParksNearCapacity,
  getTotalParks
};
