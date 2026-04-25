import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { createEnvironmentalLog, listEnvironmentalLogs } from '../controllers/environmentalLogsController.js';
import { createImageUpload } from '../utils/uploads.js';

const router = Router();
const uploadPhoto = createImageUpload('photo');

router.get('/', authenticate, authorizeRoles('authority_admin', 'environment_officer'), listEnvironmentalLogs);
router.post(
  '/',
  authenticate,
  authorizeRoles('authority_admin', 'environment_officer'),
  uploadPhoto,
  createEnvironmentalLog
);

export default router;
