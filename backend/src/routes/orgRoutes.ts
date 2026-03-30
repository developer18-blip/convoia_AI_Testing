import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';
import {
  getOrgSettings,
  updateOrgSettings,
  getOrgTeam,
  getOrgAnalytics,
  getPersonalAnalytics,
  getUserDetails,
} from '../controllers/orgController.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Organization settings
router.get('/settings', getOrgSettings);
router.put('/settings', requireRole('org_owner', 'platform_admin'), updateOrgSettings);

// Team members with usage stats
router.get('/team', getOrgTeam);

// Organization analytics
router.get('/analytics', requireRole('manager', 'org_owner', 'platform_admin'), getOrgAnalytics);

// Personal analytics (any authenticated user)
router.get('/analytics/personal', getPersonalAnalytics);

// Individual user details (for member page)
router.get('/user/:userId', getUserDetails);

export default router;
