import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import {
  exportVisitorReport,
  exportParkPerformancePdf,
  exportEnvironmentalStatusPdf,
  exportIncidentResponsePdf
} from '../controllers/reportsController.js';

const router = Router();

router.get('/visitors', authenticate, authorizeRoles('authority_admin'), exportVisitorReport);
router.get('/park-performance/pdf', authenticate, authorizeRoles('authority_admin'), exportParkPerformancePdf);
router.get('/environmental-status/pdf', authenticate, authorizeRoles('authority_admin'), exportEnvironmentalStatusPdf);
router.get('/incident-response/pdf', authenticate, authorizeRoles('authority_admin'), exportIncidentResponsePdf);

export default router;
