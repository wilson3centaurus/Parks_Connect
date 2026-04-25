const express = require('express');
const { body } = require('express-validator');

const authController = require('../controllers/authController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_MSG = 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.';
const ZW_PHONE_RULE = /^(\+263|0)\d{9}$/;

const registrationValidators = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ max: 50 }).withMessage('First name must be 50 characters or fewer.')
    .matches(/^[A-Za-z\s\-']+$/).withMessage('First name may only contain letters, spaces, hyphens, and apostrophes.'),

  body('surname')
    .trim()
    .notEmpty().withMessage('Surname is required.')
    .isLength({ max: 50 }).withMessage('Surname must be 50 characters or fewer.')
    .matches(/^[A-Za-z\s\-']+$/).withMessage('Surname may only contain letters, spaces, hyphens, and apostrophes.'),

  body('email')
    .trim()
    .isEmail().withMessage('Enter a valid email address.')
    .toLowerCase(),

  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required.')
    .matches(ZW_PHONE_RULE).withMessage('Enter a valid Zimbabwean phone number (e.g. 0771234567 or +263771234567).'),

  body('role')
    .trim()
    .isIn(['admin', 'ranger', 'tourism_officer', 'analyst', 'public']).withMessage('Choose a valid role.'),

  body('adminRegistrationKey').optional({ checkFalsy: true }).trim(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .matches(PASSWORD_RULE).withMessage(PASSWORD_MSG),

  body('confirmPassword').notEmpty().withMessage('Confirm your password.')
];

const sendResetOtpValidators = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').toLowerCase(),
  body('adminKey').trim().notEmpty().withMessage('Admin key is required.')
];

const resetValidators = [
  body('email').trim().isEmail().withMessage('Enter a valid email address.').toLowerCase(),
  body('adminKey').trim().notEmpty().withMessage('Admin key is required.'),
  body('password')
    .notEmpty().withMessage('New password is required.')
    .matches(PASSWORD_RULE).withMessage(PASSWORD_MSG),
  body('confirmPassword').notEmpty().withMessage('Re-enter the new password.')
];

router.get('/login', authController.renderLogin);
router.post(
  '/login',
  [
    body('email').trim().isEmail().withMessage('Enter a valid email address.').toLowerCase(),
    body('password').notEmpty().withMessage('Password is required.')
  ],
  authController.login
);
router.get('/logout', requireLogin, requireRole('admin', 'ranger', 'tourism_officer', 'analyst'), authController.logout);

router.get('/create-account', authController.renderCreateAccount);
router.post('/create-account/send-otp', registrationValidators, authController.sendRegistrationOtp);
router.post(
  '/create-account/verify-and-register',
  [
    ...registrationValidators,
    body('otp').trim().matches(/^\d{6}$/).withMessage('OTP must be a 6-digit code.')
  ],
  authController.verifyAndRegister
);

router.get('/forgot-password', authController.renderForgotPassword);
router.post('/forgot-password/send-otp', sendResetOtpValidators, authController.sendResetOtp);
router.post(
  '/forgot-password/verify-otp',
  [
    body('email').trim().isEmail().withMessage('Enter a valid email address.').toLowerCase(),
    body('otp').trim().matches(/^\d{6}$/).withMessage('OTP must be a 6-digit code.')
  ],
  authController.verifyResetOtp
);
router.post('/forgot-password/reset', resetValidators, authController.resetPassword);

router.get('/unauthorized', (req, res) => {
  res.status(403).render('unauthorized', { title: 'Unauthorized' });
});

module.exports = router;
