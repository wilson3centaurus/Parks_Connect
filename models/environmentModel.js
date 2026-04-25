const pool = require('../config/db');

function buildParkFilter(parkIds, column = 'er.park_id') {
  if (parkIds === null) {
    return { clause: '', params: [] };
  }

  if (!parkIds || !parkIds.length) {
    return { clause: ' AND 1 = 0', params: [] };
  }

  return { clause: ` AND ${column} IN (?)`, params: [parkIds] };
}

async function createReading({ parkId, readingType, value, unit, recordedBy, readingDate, status }) {
  const [result] = await pool.query(
    `INSERT INTO environmental_readings (park_id, reading_type, value, unit, recorded_by, reading_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [parkId, readingType, value, unit, recordedBy, readingDate, status]
  );

  return result.insertId;
}

async function listReadings({ page, limit, parkId, readingType, status, parkIds }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const filter = buildParkFilter(parkIds);

  if (parkId) {
    conditions.push('er.park_id = ?');
    params.push(parkId);
  }

  if (readingType) {
    conditions.push('er.reading_type = ?');
    params.push(readingType);
  }

  if (status) {
    conditions.push('er.status = ?');
    params.push(status);
  }

  const additional = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM environmental_readings er WHERE 1 = 1 ${filter.clause}${additional}`,
    [...filter.params, ...params]
  );

  const [rows] = await pool.query(
    `SELECT
       er.*,
       p.name AS park_name,
       CONCAT(u.first_name, ' ', u.surname) AS recorded_by_name
     FROM environmental_readings er
     INNER JOIN parks p ON p.id = er.park_id
     INNER JOIN users u ON u.id = er.recorded_by
     WHERE 1 = 1 ${filter.clause}${additional}
     ORDER BY er.reading_date DESC
     LIMIT ? OFFSET ?`,
    [...filter.params, ...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function countThisWeek(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM environmental_readings er
     WHERE YEARWEEK(er.reading_date, 1) = YEARWEEK(CURDATE(), 1)
       ${filter.clause}`,
    filter.params
  );

  return rows[0].total;
}

async function getReadingsOverTime(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT
       DATE_FORMAT(er.reading_date, '%Y-%m-%d') AS label,
       er.reading_type,
       ROUND(AVG(er.value), 2) AS average_value
     FROM environmental_readings er
     WHERE er.reading_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ${filter.clause}
     GROUP BY DATE_FORMAT(er.reading_date, '%Y-%m-%d'), er.reading_type
     ORDER BY label ASC, er.reading_type ASC`,
    filter.params
  );

  return rows;
}

async function getDroughtCandidates() {
  const [rows] = await pool.query(
    `SELECT er.park_id, p.name AS park_name, MAX(er.value) AS max_value
     FROM environmental_readings er
     INNER JOIN parks p ON p.id = er.park_id
     WHERE er.reading_type = 'drought_index'
       AND er.reading_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       AND er.value > 7
     GROUP BY er.park_id, p.name`
  );

  return rows;
}

async function getSensorOfflineParks() {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, MAX(er.reading_date) AS last_reading_at
     FROM parks p
     LEFT JOIN environmental_readings er ON er.park_id = p.id
     GROUP BY p.id, p.name
     HAVING last_reading_at IS NULL OR last_reading_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)`
  );

  return rows;
}

module.exports = {
  createReading,
  listReadings,
  countThisWeek,
  getReadingsOverTime,
  getDroughtCandidates,
  getSensorOfflineParks
};
