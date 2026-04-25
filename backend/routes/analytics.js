import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { getSummary } from '../controllers/analyticsController.js';

const router = Router();

router.get('/summary', authenticate, authorizeRoles('authority_admin', 'environment_officer'), getSummary);

export default router;
