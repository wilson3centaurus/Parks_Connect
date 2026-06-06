import { Router } from 'express';
import { body } from 'express-validator';
import { login, register, me, selfRegister, forgotPassword } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { handleValidation } from '../middleware/validate.js';

const router = Router();

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Provide a valid email address.'),
    body('password').isString().notEmpty().withMessage('Password is required.')
  ],
  handleValidation,
  login
);
router.post(
  '/register',
  authenticate,
  authorizeRoles('authority_admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Provide a valid email address.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
    body('role').optional().isString().withMessage('role must be a string.'),
    body('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.')
  ],
  handleValidation,
  register
);
router.post(
  '/self-register',
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').isEmail().withMessage('Provide a valid email address.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
    body('role').optional().isString().withMessage('role must be a string.'),
    body('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.'),
    body('it_admin_key').isString().notEmpty().withMessage('it_admin_key is required.')
  ],
  handleValidation,
  selfRegister
);
router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Provide a valid email address.'),
    body('new_password').isLength({ min: 8 }).withMessage('new_password must be at least 8 characters long.'),
    body('confirm_password').isString().notEmpty().withMessage('confirm_password is required.'),
    body('it_admin_key').isString().notEmpty().withMessage('it_admin_key is required.')
  ],
  handleValidation,
  forgotPassword
);
router.get('/me', authenticate, me);

export default router;
