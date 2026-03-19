import { Router } from 'express';
import {
  createHourlySession,
  getActiveSession,
  getAllActiveSessions,
  getSessionHistory,
  expireSession,
  expireOldSessions,
  validateSessionAccess,
} from '../controllers/sessionController.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All session routes require authentication
router.use(authMiddleware);

// Purchase hourly session (deducts from wallet)
router.post('/purchase', strictLimiter, createHourlySession);
router.post('/purchase/:userId', strictLimiter, createHourlySession);

// Get ALL active sessions for current user
router.get('/active', getAllActiveSessions);

// Get session history (expired/completed sessions)
router.get('/history', getSessionHistory);

// Get active session for a specific model
router.get('/active/:userId/:modelId', getActiveSession);

// Validate if user has active session for a model
router.get('/validate/:modelId', validateSessionAccess);
router.get('/validate', validateSessionAccess);

// Manually expire a specific session (admin only)
router.post('/expire/:sessionId', requireRole('admin', 'platform_admin'), expireSession);

// Expire all old sessions (admin only — cron job)
router.post('/expire-old', requireRole('admin', 'platform_admin'), expireOldSessions);

export default router;
