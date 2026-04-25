import { Router } from 'express';
import {
  submitMobileFeedback,
  listMobileFeedback,
  submitMobileIncident,
  listMobileIncidents
} from '../controllers/mobileController.js';
import { createImageUpload } from '../utils/uploads.js';

const router = Router();

const uploadFeedbackPhoto = createImageUpload('photo');
const uploadIncidentPhoto = createImageUpload('photo');

router.post('/feedback', uploadFeedbackPhoto, submitMobileFeedback);
router.get('/feedback', listMobileFeedback);
router.post('/incidents', uploadIncidentPhoto, submitMobileIncident);
router.get('/incidents', listMobileIncidents);

export default router;
