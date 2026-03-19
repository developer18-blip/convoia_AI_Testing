import { Router } from 'express';
import {
  getAdminStats,
  getUsers,
  getOrganizations,
  getSystemHealth,
  getOrganizationUsers,
  getUserUsageStats,
  getOrgUsageStats,
  getAdminModels,
  updateModelPricing,
  updateModelMarkup,
  toggleModel,
} from '../controllers/adminController.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);

// Dashboard statistics
router.get('/stats', requireRole('admin', 'platform_admin'), getAdminStats);

// User management
router.get('/users', requireRole('admin', 'platform_admin'), getUsers);

// Organization management
router.get('/organizations', requireRole('admin', 'platform_admin'), getOrganizations);

// System health check
router.get('/health', requireRole('admin', 'platform_admin'), getSystemHealth);

// Organization users hierarchy
router.get('/organizations/:orgId/users', requireRole('admin', 'platform_admin'), getOrganizationUsers);

// User usage statistics
router.get('/users/:userId/stats', requireRole('admin', 'platform_admin'), getUserUsageStats);

// Organization usage statistics
router.get('/organizations/:orgId/stats', requireRole('admin', 'platform_admin'), getOrgUsageStats);

// Model pricing management
router.get('/models', requireRole('admin', 'platform_admin'), getAdminModels);
router.put('/models/:id/pricing', requireRole('admin', 'platform_admin'), updateModelPricing);
router.put('/models/:id/markup', requireRole('admin', 'platform_admin'), updateModelMarkup);
router.post('/models/:id/toggle', requireRole('admin', 'platform_admin'), toggleModel);

export default router;

