const express = require('express');
const { body } = require('express-validator');

const environmentController = require('../controllers/environmentController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/environment', requireLogin, requireRole('admin', 'ranger', 'analyst'), environmentController.renderIndex);
router.get('/environment/new', requireLogin, requireRole('admin', 'ranger'), environmentController.renderForm);
router.post(
  '/environment',
  requireLogin,
  requireRole('admin', 'ranger'),
  [
    body('parkId').isInt({ min: 1 }).withMessage('Select a valid park.'),
    body('readingType').isIn(['temperature', 'rainfall', 'humidity', 'water_level', 'drought_index', 'air_quality']).withMessage('Choose a valid reading type.'),
    body('value').isFloat().withMessage('Enter a valid reading value.'),
    body('unit').trim().notEmpty().withMessage('Unit is required.'),
    body('readingDate').isISO8601().withMessage('Enter a valid reading date.'),
    body('status').isIn(['normal', 'warning', 'critical']).withMessage('Choose a valid status.')
  ],
  environmentController.create
);

module.exports = router;
