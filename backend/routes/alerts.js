import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { acknowledgeAlert, listAlerts, resolveAlert } from '../controllers/alertsController.js';
import { handleValidation } from '../middleware/validate.js';

const router = Router();

router.get(
  '/',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer'),
  [query('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.')],
  handleValidation,
  listAlerts
);
router.put(
  '/:id/acknowledge',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer'),
  [param('id').isInt({ min: 1 }).withMessage('id must be a positive integer.')],
  handleValidation,
  acknowledgeAlert
);
router.put(
  '/:id/resolve',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer'),
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer.'),
    body('notes').optional().isString().isLength({ max: 500 }).withMessage('notes must be 500 characters or fewer.')
  ],
  handleValidation,
  resolveAlert
);

export default router;
