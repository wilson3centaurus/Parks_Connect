// AUDIT: feedback + validation + blockchain compliance - status: partial - action taken: added request validation and structured error handling hooks without rewriting existing feedback flows.
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  submitFeedback,
  submitPublicFeedback,
  submitEmailFeedback,
  listFeedback,
  updateFeedbackStatus
} from '../controllers/feedbackController.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { createImageUpload } from '../utils/uploads.js';
import { handleValidation } from '../middleware/validate.js';

const router = Router();
const uploadPhoto = createImageUpload('photo');
const feedbackBodyValidators = [
  body('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5.'),
  body('visit_date').isISO8601().withMessage('visit_date must be a valid date.'),
  body('comments')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('comments must be between 1 and 500 characters.'),
  body('category')
    .optional()
    .isIn(['wildlife', 'facilities', 'safety', 'staff', 'general'])
    .withMessage('category is invalid.')
];

router.post('/public', feedbackBodyValidators, handleValidation, submitPublicFeedback);
router.post(
  '/email',
  [
    body('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.'),
    body('visit_date').optional({ values: 'falsy' }).isISO8601().withMessage('visit_date must be a valid date.'),
    body('rating').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5.'),
    body('from').optional().isString().withMessage('from must be a string.')
  ],
  handleValidation,
  submitEmailFeedback
);
router.get(
  '/',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer', 'tourism_operator'),
  [
    query('park_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('park_id must be a positive integer.'),
    query('rating').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5.'),
    query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('page must be a positive integer.'),
    query('page_size').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).withMessage('page_size must be between 1 and 100.')
  ],
  handleValidation,
  listFeedback
);
router.post(
  '/',
  authenticate,
  authorizeRoles('authority_admin', 'tourism_operator'),
  uploadPhoto,
  feedbackBodyValidators,
  handleValidation,
  submitFeedback
);
router.put(
  '/:id/status',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer'),
  [
    param('id').isInt({ min: 1 }).withMessage('id must be a positive integer.'),
    body('status').isIn(['new', 'assigned', 'in_progress', 'resolved', 'escalated', 'open', 'closed']).withMessage('status is invalid.')
  ],
  handleValidation,
  updateFeedbackStatus
);

export default router;
