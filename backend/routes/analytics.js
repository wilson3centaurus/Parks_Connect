import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { getSummary } from '../controllers/analyticsController.js';
import { handleValidation } from '../middleware/validate.js';

const router = Router();

router.get(
  '/summary',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer'),
  [
    query('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.'),
    query('start_date').optional({ values: 'falsy' }).isISO8601().withMessage('start_date must be a valid date.'),
    query('end_date').optional({ values: 'falsy' }).isISO8601().withMessage('end_date must be a valid date.')
  ],
  handleValidation,
  getSummary
);

export default router;
