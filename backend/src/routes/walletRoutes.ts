import { Router } from 'express';
import {
  getWalletBalance,
  topUpWallet,
  getTransactionHistory,
  getWalletSummary,
  createPaymentIntent,
  createCheckoutSession,
  verifyCheckoutSession,
} from '../controllers/walletController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All wallet routes require authentication
router.use(authMiddleware);

// Get wallet balance
router.get('/balance/:userId', getWalletBalance);
router.get('/balance', getWalletBalance);

// Get wallet summary (for dashboard)
router.get('/summary', getWalletSummary);

// Create Stripe PaymentIntent for top-up (embedded Elements flow)
router.post('/create-payment-intent', strictLimiter, createPaymentIntent);

// Create Stripe Checkout Session (redirect flow — most secure)
router.post('/create-checkout-session', strictLimiter, createCheckoutSession);

// Verify checkout session status (called by success page)
router.get('/verify-session/:sessionId', verifyCheckoutSession);

// Top up wallet (called by webhook after payment confirms)
router.post('/topup/:userId', strictLimiter, topUpWallet);
router.post('/topup', strictLimiter, topUpWallet);

// Get transaction history
router.get('/transactions/:userId', getTransactionHistory);
router.get('/transactions', getTransactionHistory);

export default router;
