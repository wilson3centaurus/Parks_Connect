import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import {
  listParks,
  getAssigned,
  listAssignments,
  assignPark,
  upsertThreshold,
  listThresholds
} from '../controllers/parksController.js';

const router = Router();

router.get('/', listParks);
router.get('/assigned', authenticate, authorizeRoles('authority_admin', 'environment_officer', 'tourism_operator'), getAssigned);
router.get('/assignments', authenticate, authorizeRoles('authority_admin'), listAssignments);
router.post('/assign', authenticate, authorizeRoles('authority_admin'), assignPark);
router.get('/thresholds', authenticate, authorizeRoles('authority_admin', 'environment_officer'), listThresholds);
router.post('/thresholds', authenticate, authorizeRoles('authority_admin'), upsertThreshold);

export default router;
