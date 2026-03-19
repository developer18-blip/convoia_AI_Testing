import { Router } from 'express';
import express from 'express';
import { handleStripeWebhook } from '../controllers/stripeWebhookController.js';
import {
  createSubscriptionCheckout,
  createPortalSession,
  getSubscriptionStatus,
  cancelSubscription,
} from '../controllers/stripeController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();

// ─── Webhook — raw body, NO auth ─────────────────────────────────────────────
// Must be BEFORE any JSON body parser middleware
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// ─── Protected subscription routes ───────────────────────────────────────────
router.use(jwtOrApiKey);

router.post('/create-checkout', createSubscriptionCheckout);
router.post('/create-portal', createPortalSession);
router.get('/subscription', getSubscriptionStatus);
router.post('/cancel-subscription', cancelSubscription);

export default router;
