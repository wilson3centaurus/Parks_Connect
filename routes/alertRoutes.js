const express = require('express');
const { body, param } = require('express-validator');

const alertController = require('../controllers/alertController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/alerts', requireLogin, requireRole('admin', 'ranger', 'analyst'), alertController.renderIndex);
router.get('/alerts/create', requireLogin, requireRole('admin', 'ranger'), alertController.renderCreateForm);
router.post(
  '/alerts',
  requireLogin,
  requireRole('admin', 'ranger'),
  [
    body('parkId').isInt({ min: 1 }).withMessage('Select a valid park.'),
    body('type').isIn(['drought', 'infrastructure_failure', 'security_incident', 'capacity_threshold', 'wildlife_emergency', 'weather']).withMessage('Choose a valid alert type.'),
    body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Choose a valid severity.'),
    body('title').trim().notEmpty().withMessage('Alert title is required.'),
    body('description').trim().notEmpty().withMessage('Alert description is required.')
  ],
  alertController.create
);
router.post(
  '/alerts/:id/acknowledge',
  requireLogin,
  requireRole('admin', 'ranger'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid alert.')],
  alertController.acknowledge
);
router.post(
  '/alerts/:id/resolve',
  requireLogin,
  requireRole('admin'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid alert.')],
  alertController.resolve
);
router.post(
  '/notifications/:id/read',
  requireLogin,
  requireRole('admin', 'ranger', 'tourism_officer', 'analyst'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid notification.')],
  alertController.markNotificationRead
);

module.exports = router;
