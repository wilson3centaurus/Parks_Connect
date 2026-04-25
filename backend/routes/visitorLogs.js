import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { createVisitorLog, listVisitorLogs } from '../controllers/visitorLogsController.js';

const router = Router();

router.get('/', authenticate, authorizeRoles('authority_admin', 'tourism_operator'), listVisitorLogs);
router.post('/', authenticate, authorizeRoles('authority_admin', 'tourism_operator'), createVisitorLog);

export default router;
