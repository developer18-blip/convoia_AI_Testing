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

// Diagnostic: check if usage logs exist for current user
router.get('/analytics/debug', async (req, res) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const user = await (await import('../config/db.js')).default.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, name: true, role: true, organizationId: true },
  });
  const totalLogs = await (await import('../config/db.js')).default.usageLog.count({
    where: { userId: req.user.userId },
  });
  const logsWithOrg = await (await import('../config/db.js')).default.usageLog.count({
    where: { organizationId: user?.organizationId || 'none' },
  });
  const recentLogs = await (await import('../config/db.js')).default.usageLog.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, createdAt: true, totalTokens: true, customerPrice: true, organizationId: true, modelId: true },
  });
  res.json({
    user,
    jwtOrgId: req.user.organizationId,
    dbOrgId: user?.organizationId,
    totalLogsForUser: totalLogs,
    totalLogsForOrg: logsWithOrg,
    recentLogs,
  });
});

// Individual user details (for member page)
router.get('/user/:userId', getUserDetails);

export default router;
