import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  login,
  register,
  me,
  listUsers,
  deleteUser,
  adminResetUserPassword,
  changePassword
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { handleValidation } from '../middleware/validate.js';

const router = Router();

// Public: login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Provide a valid email address.'),
    body('password').isString().notEmpty().withMessage('Password is required.')
  ],
  handleValidation,
  login
);

// Admin-only: create a staff account
router.post(
  '/register',
  authenticate,
  authorizeRoles('authority_admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Provide a valid email address.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('role').optional().isString(),
    body('park_id').optional({ values: 'falsy' }).isInt({ min: 1 })
  ],
  handleValidation,
  register
);

// Admin-only: list all staff users
router.get('/users', authenticate, authorizeRoles('authority_admin'), listUsers);

// Admin-only: delete a staff user
router.delete(
  '/users/:id',
  authenticate,
  authorizeRoles('authority_admin'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid user ID')],
  handleValidation,
  deleteUser
);

// Admin-only: reset a staff user's password
router.post(
  '/users/:id/reset-password',
  authenticate,
  authorizeRoles('authority_admin'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid user ID'),
    body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
  ],
  handleValidation,
  adminResetUserPassword
);

// Authenticated: change own password (staff or superadmin)
router.post(
  '/change-password',
  authenticate,
  [
    body('current_password').isString().notEmpty().withMessage('Current password is required.'),
    body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')
  ],
  handleValidation,
  changePassword
);

// Authenticated: get current user profile
router.get('/me', authenticate, me);

export default router;
