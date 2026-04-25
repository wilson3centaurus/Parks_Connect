import { Router } from 'express';
import { submitFeedback, listFeedback, updateFeedbackStatus } from '../controllers/feedbackController.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { createImageUpload } from '../utils/uploads.js';

const router = Router();
const uploadPhoto = createImageUpload('photo');

router.get('/', authenticate, authorizeRoles('authority_admin', 'environment_officer', 'tourism_operator'), listFeedback);
router.post('/', authenticate, authorizeRoles('authority_admin', 'tourism_operator'), uploadPhoto, submitFeedback);
router.put('/:id/status', authenticate, authorizeRoles('authority_admin', 'environment_officer'), updateFeedbackStatus);

export default router;
