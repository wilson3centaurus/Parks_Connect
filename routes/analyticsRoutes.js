const express = require('express');

const analyticsController = require('../controllers/analyticsController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/analytics', requireLogin, requireRole('admin', 'analyst', 'tourism_officer'), analyticsController.renderAnalyticsPage);
router.get('/analytics/export', requireLogin, requireRole('admin', 'analyst'), analyticsController.exportDataset);

router.get('/api/analytics/wildlife-by-species', requireLogin, requireRole('admin', 'analyst', 'tourism_officer', 'ranger'), analyticsController.getWildlifeBySpecies);
router.get('/api/analytics/readings-over-time', requireLogin, requireRole('admin', 'analyst', 'tourism_officer', 'ranger'), analyticsController.getReadingsOverTime);
router.get('/api/analytics/feedback-ratings', requireLogin, requireRole('admin', 'analyst', 'tourism_officer', 'ranger'), analyticsController.getFeedbackRatings);
router.get('/api/analytics/alerts-by-type', requireLogin, requireRole('admin', 'analyst', 'tourism_officer', 'ranger'), analyticsController.getAlertsByType);
router.get('/api/analytics/visitor-trends', requireLogin, requireRole('admin', 'analyst', 'tourism_officer', 'ranger'), analyticsController.getVisitorTrends);
router.get('/api/analytics/infrastructure-status', requireLogin, requireRole('admin', 'analyst', 'tourism_officer', 'ranger'), analyticsController.getInfrastructureStatus);

module.exports = router;
