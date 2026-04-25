const express = require('express');
const { body } = require('express-validator');

const infrastructureController = require('../controllers/infrastructureController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/infrastructure', requireLogin, requireRole('admin', 'ranger', 'analyst'), infrastructureController.renderIndex);
router.get('/infrastructure/new', requireLogin, requireRole('admin', 'ranger'), infrastructureController.renderForm);
router.post(
  '/infrastructure',
  requireLogin,
  requireRole('admin', 'ranger'),
  [
    body('parkId').isInt({ min: 1 }).withMessage('Select a valid park.'),
    body('name').trim().notEmpty().withMessage('Infrastructure name is required.'),
    body('type').isIn(['road', 'fence', 'gate', 'building', 'water_point', 'communications', 'vehicle']).withMessage('Choose a valid infrastructure type.'),
    body('status').isIn(['operational', 'needs_maintenance', 'failed']).withMessage('Choose a valid status.'),
    body('lastInspected').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid inspection date.'),
    body('notes').optional({ checkFalsy: true }).trim()
  ],
  infrastructureController.create
);

module.exports = router;
