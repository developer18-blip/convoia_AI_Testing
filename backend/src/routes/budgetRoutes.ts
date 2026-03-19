import { Router } from 'express';
import {
  setBudget,
  checkBudget,
  getBudgetStatus,
  getOrgBudgets,
  resetMonthlyBudgets,
  autoDowngradeUser,
} from '../controllers/budgetController.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All budget routes require authentication
router.use(authMiddleware);

// Set budget for a user
router.post('/set/:userId', apiLimiter, setBudget);
router.post('/set', apiLimiter, setBudget);

// Get current user's budget status (dashboard)
router.get('/status', getBudgetStatus);

// Check budget for a specific user
router.get('/check/:userId', checkBudget);
router.get('/check', checkBudget);

// Get all budgets for an organization (manager+)
router.get('/org/:orgId', getOrgBudgets);

// Reset monthly budgets (admin only - typically called by cron)
router.post('/reset', requireRole('admin', 'platform_admin'), resetMonthlyBudgets);

// Auto downgrade user (admin only)
router.post('/downgrade/:userId', requireRole('admin', 'platform_admin'), autoDowngradeUser);

export default router;
