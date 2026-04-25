const express = require('express');
const { body, param } = require('express-validator');

const adminController = require('../controllers/adminController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', requireLogin, requireRole('admin', 'ranger', 'tourism_officer', 'analyst'), adminController.renderDashboard);

router.get('/admin/users', requireLogin, requireRole('admin'), adminController.renderUsers);
router.post(
  '/admin/users/:id/role',
  requireLogin,
  requireRole('admin'),
  [param('id').isInt().withMessage('Invalid user.'), body('role').isIn(['admin', 'ranger', 'tourism_officer', 'analyst', 'public']).withMessage('Select a valid role.')],
  adminController.updateUserRole
);
router.post(
  '/admin/users/:id/toggle',
  requireLogin,
  requireRole('admin'),
  [param('id').isInt().withMessage('Invalid user.')],
  adminController.toggleUser
);
router.post(
  '/admin/users/:id/assign-park',
  requireLogin,
  requireRole('admin'),
  [param('id').isInt().withMessage('Invalid user.'), body('parkId').isInt({ min: 1 }).withMessage('Select a valid park.')],
  adminController.assignUserPark
);

router.get('/admin/parks', requireLogin, requireRole('admin'), adminController.renderParks);
router.post(
  '/admin/parks',
  requireLogin,
  requireRole('admin'),
  [
    body('name').trim().notEmpty().withMessage('Park name is required.'),
    body('location').trim().notEmpty().withMessage('Location is required.'),
    body('region').trim().notEmpty().withMessage('Region is required.'),
    body('sizeHectares').isFloat({ min: 0.01 }).withMessage('Enter a valid park size.'),
    body('capacity').isInt({ min: 1 }).withMessage('Enter a valid capacity.'),
    body('status').isIn(['open', 'closed', 'restricted']).withMessage('Choose a valid status.')
  ],
  adminController.createPark
);
router.post(
  '/admin/parks/:id/visitors',
  requireLogin,
  requireRole('admin', 'tourism_officer'),
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid park.'),
    body('visitors').isInt({ min: 0 }).withMessage('Visitors must be zero or greater.'),
    body('logDate').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid log date.')
  ],
  adminController.updateVisitorCount
);

router.get('/admin/logs', requireLogin, requireRole('admin'), adminController.renderLogs);
router.get('/admin/logs/export', requireLogin, requireRole('admin'), adminController.exportLogsCsv);

module.exports = router;
