const pool = require('../config/db');

async function createUser({ firstName, surname, email, phone, role, password }) {
  const [result] = await pool.query(
    `INSERT INTO users (first_name, surname, email, phone, role, password)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [firstName, surname, email, phone, role, password]
  );

  return result.insertId;
}

async function findByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function listUsers({ page, limit, search, role, status }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(u.first_name LIKE ? OR u.surname LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (role) {
    conditions.push('u.role = ?');
    params.push(role);
  }

  if (status === 'active') {
    conditions.push('u.is_active = 1');
  }

  if (status === 'inactive') {
    conditions.push('u.is_active = 0');
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${whereClause}`, params);

  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.first_name,
       u.surname,
       u.email,
       u.phone,
       u.role,
       u.is_active,
       u.created_at,
       GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') AS assigned_parks
     FROM users u
     LEFT JOIN user_parks up ON up.user_id = u.id
     LEFT JOIN parks p ON p.id = up.park_id
     ${whereClause}
     GROUP BY u.id, u.first_name, u.surname, u.email, u.phone, u.role, u.is_active, u.created_at
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    rows,
    total: countRows[0].total
  };
}

async function updateRole(userId, role) {
  await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
  return findById(userId);
}

async function toggleActive(userId) {
  await pool.query('UPDATE users SET is_active = NOT is_active WHERE id = ?', [userId]);
  return findById(userId);
}

async function assignPark(userId, parkId) {
  await pool.query('INSERT IGNORE INTO user_parks (user_id, park_id) VALUES (?, ?)', [userId, parkId]);
}

async function getAssignedParkIds(userId) {
  const [rows] = await pool.query('SELECT park_id FROM user_parks WHERE user_id = ?', [userId]);
  return rows.map((row) => row.park_id);
}

async function getAssignedParks(userId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.name, p.location, p.region
     FROM user_parks up
     INNER JOIN parks p ON p.id = up.park_id
     WHERE up.user_id = ?
     ORDER BY p.name ASC`,
    [userId]
  );

  return rows;
}

async function getTotals() {
  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM users');
  return rows[0].total;
}

async function getUsersForAlertPark(parkId) {
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id, u.first_name, u.surname, u.email, u.role
     FROM users u
     LEFT JOIN user_parks up ON up.user_id = u.id AND up.park_id = ?
     WHERE u.is_active = 1
       AND (u.role = 'admin' OR (u.role = 'ranger' AND up.park_id IS NOT NULL))
     ORDER BY u.role ASC, u.first_name ASC, u.surname ASC`,
    [parkId]
  );

  return rows;
}

async function getUserOptions() {
  const [rows] = await pool.query(
    `SELECT id, CONCAT(first_name, ' ', surname) AS name, email
     FROM users
     ORDER BY first_name ASC, surname ASC`
  );

  return rows;
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  listUsers,
  updateRole,
  toggleActive,
  assignPark,
  getAssignedParkIds,
  getAssignedParks,
  getTotals,
  getUsersForAlertPark,
  getUserOptions
};
