import { Router } from 'express';
import {
  getMyUsage,
  getOrgUsage,
  getDashboardUsage,
  getAdminUsage,
} from '../controllers/usageController.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Current user's usage history (paginated + filters)
router.get('/my', getMyUsage);

// Dashboard stats (today/week/month, top models, chart data)
router.get('/dashboard', getDashboardUsage);

// Platform-wide admin stats
router.get('/admin', requireRole('platform_admin'), getAdminUsage);

// Organization usage (manager+)
router.get('/org/:orgId', getOrgUsage);

export default router;
