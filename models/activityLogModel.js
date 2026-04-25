const pool = require('../config/db');

async function create({ userId, action, module, description, ipAddress, userAgent }) {
  await pool.query(
    `INSERT INTO activity_logs (user_id, action, module, description, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId || null, action, module, description, ipAddress || null, userAgent || null]
  );
}

async function getRecent(limit = 10) {
  const [rows] = await pool.query(
    `SELECT
       al.*,
       CONCAT(COALESCE(u.first_name, 'System'), ' ', COALESCE(u.surname, '')) AS user_name
     FROM activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows;
}

async function list({ page, limit, user, module, from, to }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (user) {
    conditions.push('al.user_id = ?');
    params.push(user);
  }

  if (module) {
    conditions.push('al.module = ?');
    params.push(module);
  }

  if (from) {
    conditions.push('DATE(al.created_at) >= ?');
    params.push(from);
  }

  if (to) {
    conditions.push('DATE(al.created_at) <= ?');
    params.push(to);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM activity_logs al ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT
       al.*,
       CONCAT(COALESCE(u.first_name, 'System'), ' ', COALESCE(u.surname, '')) AS user_name,
       u.email AS user_email
     FROM activity_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

module.exports = {
  create,
  getRecent,
  list
};
