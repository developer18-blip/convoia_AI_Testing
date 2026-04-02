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
  deleteUserPermanently,
  changeUserRole,
  suspendOrganization,
  deleteOrganization,
  getRevenueDashboard,
  adminCreateAccount,
  adminSendTokens,
  getAdminAnalytics,
} from '../controllers/adminController.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);

// Dashboard statistics
router.get('/stats', requireRole('admin', 'platform_admin'), getAdminStats);

// User management
router.get('/users', requireRole('admin', 'platform_admin'), getUsers);
router.put('/users/:userId/role', requireRole('admin', 'platform_admin'), changeUserRole);
router.delete('/users/:userId', requireRole('admin', 'platform_admin'), deleteUserPermanently);

// Organization management
router.get('/organizations', requireRole('admin', 'platform_admin'), getOrganizations);
router.put('/orgs/:orgId/suspend', requireRole('admin', 'platform_admin'), suspendOrganization);
router.delete('/orgs/:orgId', requireRole('admin', 'platform_admin'), deleteOrganization);

// Revenue dashboard
router.get('/revenue/dashboard', requireRole('admin', 'platform_admin'), getRevenueDashboard);

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

// Admin account creation & token management
router.post('/accounts', requireRole('admin', 'platform_admin'), adminCreateAccount);
router.post('/send-tokens', requireRole('admin', 'platform_admin'), adminSendTokens);

// Admin analytics
router.get('/analytics', requireRole('admin', 'platform_admin'), getAdminAnalytics);

export default router;

