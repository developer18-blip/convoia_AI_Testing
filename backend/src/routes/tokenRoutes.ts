import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';
import {
  allocateTokens,
  getMyAllocation,
  getTokenPool,
  getTeamTokens,
  updateAllocation,
  revokeAllocation,
} from '../controllers/tokenController.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Allocate tokens (org_owner or manager)
router.post('/allocate', requireRole('org_owner', 'manager', 'platform_admin'), allocateTokens);

// Get my token allocation (any authenticated user)
router.get('/my-allocation', getMyAllocation);

// Get org token pool (org_owner only)
router.get('/pool', requireRole('org_owner', 'platform_admin'), getTokenPool);

// Get team token usage (manager+)
router.get('/team', requireRole('manager', 'org_owner', 'platform_admin'), getTeamTokens);

// Update allocation (assigner only)
router.put('/allocate/:id', requireRole('org_owner', 'manager', 'platform_admin'), updateAllocation);

// Revoke allocation (assigner only)
router.delete('/allocate/:id', requireRole('org_owner', 'manager', 'platform_admin'), revokeAllocation);

export default router;
