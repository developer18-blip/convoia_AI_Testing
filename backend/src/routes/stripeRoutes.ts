import { Router } from 'express';
import {
  getTokenPackages,
  purchaseTokens,
  getTokenPoolStatus,
  createPortalSession,
  verifyAndCreditSession,
} from '../controllers/stripeController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();

// Public
router.get('/token-packages', getTokenPackages);

// Protected (global express.json + optionalAuth already ran)
router.use(jwtOrApiKey);

router.post('/purchase-tokens', purchaseTokens);
router.get('/verify-session/:sessionId', verifyAndCreditSession);
router.get('/token-pool', getTokenPoolStatus);
router.post('/create-portal', createPortalSession);

export default router;
