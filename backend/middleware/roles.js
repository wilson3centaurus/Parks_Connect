import { normalizeRole } from '../utils/parks.js';

export function authorizeRoles(...roles) {
  const allowed = roles.map((role) => normalizeRole(role));
  return (req, res, next) => {
    const userRole = normalizeRole(req.user?.role);
    if (!userRole || !allowed.includes(userRole)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.user.role = userRole;
    next();
  };
}
