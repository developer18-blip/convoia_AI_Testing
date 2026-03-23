import { Router } from 'express';
import {
  getTokenBalance,
  getTokenPackagesEndpoint,
  getTokenHistory,
  allocateTokensToMember,
  devAddTokens,
} from '../controllers/tokenWalletController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();

// Public
router.get('/packages', getTokenPackagesEndpoint);

// Protected
router.use(jwtOrApiKey);
router.get('/balance', getTokenBalance);
router.get('/history', getTokenHistory);
router.post('/allocate', allocateTokensToMember);

// Dev only — test token addition without Stripe
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-add', devAddTokens);
}

export default router;
