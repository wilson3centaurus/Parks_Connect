const pool = require('../config/db');

function buildParkFilter(parkIds, column = 'tf.park_id') {
  if (parkIds === null) {
    return { clause: '', params: [] };
  }

  if (!parkIds || !parkIds.length) {
    return { clause: ' AND 1 = 0', params: [] };
  }

  return { clause: ` AND ${column} IN (?)`, params: [parkIds] };
}

async function createFeedback({ parkId, visitorName, visitorEmail, visitorPhone, channel, rating, category, message }) {
  const [result] = await pool.query(
    `INSERT INTO tourist_feedback
      (park_id, visitor_name, visitor_email, visitor_phone, channel, rating, category, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [parkId, visitorName, visitorEmail, visitorPhone || null, channel, rating, category, message]
  );

  return result.insertId;
}

async function listFeedback({ page, limit, parkId, status, category, parkIds }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  const filter = buildParkFilter(parkIds);

  if (parkId) {
    conditions.push('tf.park_id = ?');
    params.push(parkId);
  }

  if (status) {
    conditions.push('tf.status = ?');
    params.push(status);
  }

  if (category) {
    conditions.push('tf.category = ?');
    params.push(category);
  }

  const additional = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM tourist_feedback tf WHERE 1 = 1 ${filter.clause}${additional}`,
    [...filter.params, ...params]
  );

  const [rows] = await pool.query(
    `SELECT tf.*, p.name AS park_name
     FROM tourist_feedback tf
     INNER JOIN parks p ON p.id = tf.park_id
     WHERE 1 = 1 ${filter.clause}${additional}
     ORDER BY tf.submitted_at DESC
     LIMIT ? OFFSET ?`,
    [...filter.params, ...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function updateStatus(id, status) {
  await pool.query('UPDATE tourist_feedback SET status = ? WHERE id = ?', [status, id]);
}

async function getById(id) {
  const [rows] = await pool.query(
    `SELECT tf.*, p.name AS park_name
     FROM tourist_feedback tf
     INNER JOIN parks p ON p.id = tf.park_id
     WHERE tf.id = ?
     LIMIT 1`,
    [id]
  );

  return rows[0] || null;
}

async function getPendingCount(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM tourist_feedback tf
     WHERE tf.status = 'pending' ${filter.clause}`,
    filter.params
  );

  return rows[0].total;
}

async function getAverageRatingThisMonth(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT ROUND(AVG(tf.rating), 2) AS average_rating
     FROM tourist_feedback tf
     WHERE MONTH(tf.submitted_at) = MONTH(CURDATE())
       AND YEAR(tf.submitted_at) = YEAR(CURDATE())
       ${filter.clause}`,
    filter.params
  );

  return rows[0].average_rating || 0;
}

async function getRecentFeedback(parkIds, limit = 5) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT tf.*, p.name AS park_name
     FROM tourist_feedback tf
     INNER JOIN parks p ON p.id = tf.park_id
     WHERE 1 = 1 ${filter.clause}
     ORDER BY tf.submitted_at DESC
     LIMIT ?`,
    [...filter.params, limit]
  );

  return rows;
}

async function getRatingsDistribution(parkIds) {
  const filter = buildParkFilter(parkIds);
  const [rows] = await pool.query(
    `SELECT tf.rating, COUNT(*) AS total
     FROM tourist_feedback tf
     WHERE 1 = 1 ${filter.clause}
     GROUP BY tf.rating
     ORDER BY tf.rating ASC`,
    filter.params
  );

  return rows;
}

module.exports = {
  createFeedback,
  listFeedback,
  getById,
  updateStatus,
  getPendingCount,
  getAverageRatingThisMonth,
  getRecentFeedback,
  getRatingsDistribution
};
