import { Router } from 'express';
import {
  createInvite,
  acceptInvite,
  getInviteByToken,
  getOrgInvites,
  revokeInvite,
  resendInvite,
  getTeamMembers,
  removeMember,
  assignManager,
  updateMemberRole,
} from '../controllers/teamController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();

// Public route — anyone with the token can view invite details
router.get('/invite/:token', getInviteByToken);

// Protected routes
router.use(jwtOrApiKey);

router.post('/invite', createInvite);
router.post('/accept-invite', acceptInvite);
router.get('/invites', getOrgInvites);
router.delete('/invite/:inviteId', revokeInvite);
router.post('/invite/:inviteId/resend', resendInvite);

router.get('/members', getTeamMembers);
router.delete('/members/:userId', removeMember);
router.patch('/members/:userId/role', updateMemberRole);
router.post('/assign-manager', assignManager);

export default router;
