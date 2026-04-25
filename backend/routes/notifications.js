import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { listNotifications, resolveNotification } from '../controllers/notificationsController.js';

const router = Router();

router.get('/', authenticate, authorizeRoles('authority_admin', 'environment_officer'), listNotifications);
router.put('/:id/resolve', authenticate, authorizeRoles('authority_admin', 'environment_officer'), resolveNotification);

export default router;
