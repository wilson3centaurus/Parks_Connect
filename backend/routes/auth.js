import { Router } from 'express';
import { login, register, me, selfRegister } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';

const router = Router();

router.post('/login', login);
router.post('/register', authenticate, authorizeRoles('authority_admin'), register);
router.post('/self-register', selfRegister);
router.get('/me', authenticate, me);

export default router;
