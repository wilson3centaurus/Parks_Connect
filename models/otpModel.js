const pool = require('../config/db');

async function invalidate(email, purpose) {
  await pool.query(
    'UPDATE otp_verifications SET is_used = 1 WHERE email = ? AND purpose = ? AND is_used = 0',
    [email, purpose]
  );
}

async function createOtp(email, purpose, otpCode, expiresAt) {
  await invalidate(email, purpose);
  const [result] = await pool.query(
    `INSERT INTO otp_verifications (email, otp_code, purpose, expires_at)
     VALUES (?, ?, ?, ?)`,
    [email, otpCode, purpose, expiresAt]
  );

  return result.insertId;
}

async function findValidOtp(email, purpose, otpCode) {
  const [rows] = await pool.query(
    `SELECT *
     FROM otp_verifications
     WHERE email = ?
       AND purpose = ?
       AND otp_code = ?
       AND is_used = 0
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, purpose, otpCode]
  );

  return rows[0] || null;
}

async function consumeOtp(id) {
  await pool.query(
    'UPDATE otp_verifications SET is_verified = 1, is_used = 1 WHERE id = ?',
    [id]
  );
}

module.exports = {
  createOtp,
  findValidOtp,
  consumeOtp,
  invalidate
};
