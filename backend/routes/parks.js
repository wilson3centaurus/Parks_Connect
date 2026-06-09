import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import {
  listParks,
  getAssigned,
  getParkDetail,
  listAssignments,
  assignPark,
  upsertThreshold,
  listThresholds,
  uploadParkPhoto,
  clearParkPhoto
} from '../controllers/parksController.js';

const router = Router();
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('photo');

router.get('/', listParks);
router.get('/assigned', authenticate, authorizeRoles('authority_admin', 'environment_officer', 'tourism_operator'), getAssigned);
router.get('/assignments', authenticate, authorizeRoles('authority_admin'), listAssignments);
router.post('/assign', authenticate, authorizeRoles('authority_admin'), assignPark);
router.get('/thresholds', authenticate, authorizeRoles('authority_admin', 'environment_officer'), listThresholds);
router.post('/thresholds', authenticate, authorizeRoles('authority_admin'), upsertThreshold);
router.post('/:id/photo', authenticate, authorizeRoles('authority_admin'), memUpload, uploadParkPhoto);
router.delete('/:id/photo', authenticate, authorizeRoles('authority_admin'), clearParkPhoto);
router.get('/:id', getParkDetail);

export default router;
