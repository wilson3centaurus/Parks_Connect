const pool = require('../config/db');

async function create({ userId, title, message, type, link }) {
  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, title, message, type, link)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, title, message, type, link || null]
  );

  return result.insertId;
}

async function createBulk(notifications) {
  if (!notifications.length) {
    return;
  }

  const values = notifications.map((notification) => [
    notification.userId,
    notification.title,
    notification.message,
    notification.type,
    notification.link || null
  ]);

  await pool.query(
    'INSERT INTO notifications (user_id, title, message, type, link) VALUES ?',
    [values]
  );
}

async function countUnread(userId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );

  return rows[0].total;
}

async function getRecentForUser(userId, limit = 5) {
  const [rows] = await pool.query(
    `SELECT *
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  );

  return rows;
}

async function markAsRead(id, userId) {
  await pool.query(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, userId]
  );
}

module.exports = {
  create,
  createBulk,
  countUnread,
  getRecentForUser,
  markAsRead
};
