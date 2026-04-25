import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { normalizeRole } from '../utils/parks.js';

dotenv.config();

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    req.user = { ...decoded, role: normalizeRole(decoded.role) };
    return next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
