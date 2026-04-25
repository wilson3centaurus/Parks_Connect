const express = require('express');
const path = require('path');
const multer = require('multer');
const { body } = require('express-validator');

const wildlifeController = require('../controllers/wildlifeController');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, path.join(__dirname, '..', 'public', 'uploads', 'wildlife'));
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    callback(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Only JPEG, PNG, and WEBP images are allowed.'));
    }

    return callback(null, true);
  }
});

router.get('/wildlife', requireLogin, requireRole('admin', 'ranger', 'analyst'), wildlifeController.renderIndex);
router.get('/wildlife/new', requireLogin, requireRole('admin', 'ranger'), wildlifeController.renderForm);
router.post(
  '/wildlife',
  requireLogin,
  requireRole('admin', 'ranger'),
  upload.single('photo'),
  [
    body('parkId').isInt({ min: 1 }).withMessage('Select a valid park.'),
    body('speciesName').trim().notEmpty().withMessage('Species name is required.'),
    body('commonName').trim().notEmpty().withMessage('Common name is required.'),
    body('category').isIn(['mammal', 'bird', 'reptile', 'amphibian', 'fish', 'insect', 'plant']).withMessage('Choose a valid category.'),
    body('count').isInt({ min: 1 }).withMessage('Count must be at least 1.'),
    body('latitude').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.'),
    body('longitude').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.'),
    body('sightingDate').isISO8601().withMessage('Enter a valid sighting date.'),
    body('notes').optional({ checkFalsy: true }).trim()
  ],
  wildlifeController.create
);

module.exports = router;
