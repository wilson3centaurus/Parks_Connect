import { Router } from 'express';
import { body, param } from 'express-validator';
import multer from 'multer';
import {
  login,
  register,
  me,
  listUsers,
  deleteUser,
  adminResetUserPassword,
  changePassword,
  completeOnboarding,
  uploadPhoto,
  impersonate
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { handleValidation } from '../middleware/validate.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    body('role').optional().isString(),
    body('id_number').optional().isString(),
    body('phone').optional().isString(),
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

// Admin-only: reset a staff user's password (defaults to their ID number)
router.post(
  '/users/:id/reset-password',
  authenticate,
  authorizeRoles('authority_admin'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid user ID')],
  handleValidation,
  adminResetUserPassword
);

// Authenticated: change own password
router.post(
  '/change-password',
  authenticate,
  [
    body('current_password').isString().notEmpty().withMessage('Current password is required.'),
    body('new_password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters.')
  ],
  handleValidation,
  changePassword
);

// Authenticated: complete onboarding (mark first_login = false)
router.post('/complete-onboarding', authenticate, completeOnboarding);

// Authenticated: upload profile photo
router.post('/upload-photo', authenticate, upload.single('photo'), uploadPhoto);

// Admin-only: impersonate another user
router.post(
  '/impersonate',
  authenticate,
  authorizeRoles('authority_admin'),
  [
    body('target_user_id').isInt({ min: 1 }).withMessage('target_user_id required'),
    body('impersonate_key').isString().notEmpty().withMessage('impersonate_key required')
  ],
  handleValidation,
  impersonate
);

// Authenticated: get current user profile
router.get('/me', authenticate, me);

export default router;
