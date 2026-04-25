const express = require('express');
const { body, param } = require('express-validator');

const feedbackController = require('../controllers/feedbackController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/feedback/submit', feedbackController.renderSubmit);
router.post(
  '/feedback/submit',
  [
    body('parkId').isInt({ min: 1 }).withMessage('Select a valid park.'),
    body('visitorName').trim().notEmpty().withMessage('Visitor name is required.'),
    body('visitorEmail').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
    body('visitorPhone').optional({ checkFalsy: true }).trim(),
    body('channel').isIn(['web', 'sms', 'mobile_app']).withMessage('Choose a valid channel.'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.'),
    body('category').isIn(['facilities', 'wildlife', 'staff', 'safety', 'general']).withMessage('Choose a valid category.'),
    body('message').trim().notEmpty().withMessage('Feedback message is required.')
  ],
  feedbackController.submit
);

router.get('/feedback/manage', requireLogin, requireRole('admin', 'tourism_officer', 'analyst'), feedbackController.renderManage);
router.post(
  '/feedback/:id/status',
  requireLogin,
  requireRole('admin', 'tourism_officer'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid feedback item.'), body('status').isIn(['pending', 'reviewed', 'resolved']).withMessage('Choose a valid status.')],
  feedbackController.updateStatus
);

module.exports = router;
