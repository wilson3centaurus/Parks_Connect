import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { authorizeRoles } from '../middleware/roles.js';
import { handleValidation } from '../middleware/validate.js';
import { generateMnemonic, getWalletInfo, verifyRecord } from '../controllers/blockchainController.js';

const router = Router();

router.get('/generate-mnemonic', authenticate, authorizeRoles('authority_admin'), generateMnemonic);
router.get('/wallet', authenticate, authorizeRoles('authority_admin'), getWalletInfo);
router.post(
  '/verify/:recordId',
  authenticate,
  authorizeRoles('authority_admin'),
  [
    param('recordId').isString().notEmpty().withMessage('recordId is required.'),
    body('canonicalData').isObject().withMessage('canonicalData must be an object.')
  ],
  handleValidation,
  verifyRecord
);

export default router;
