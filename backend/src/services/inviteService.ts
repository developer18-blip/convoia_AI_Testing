import crypto from 'crypto';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { EmailService } from './emailService.js';

export class InviteService {
  /**
   * Generate a cryptographically secure 64-char hex token.
   */
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create an organization invite.
   */
  static async createInvite(params: {
    organizationId: string;
    invitedById: string;
    email: string;
    role: 'manager' | 'employee';
    tokensAllocated?: number;
  }) {
    const { organizationId, invitedById, email, role, tokensAllocated } = params;

    // Validate role
    if (!['manager', 'employee'].includes(role)) {
      throw new Error('Invalid role. Must be manager or employee.');
    }

    // Check inviter exists and has permission
    const inviter = await prisma.user.findUnique({
      where: { id: invitedById },
      include: { organization: true },
    });

    if (!inviter) throw new Error('Inviter not found');

    // Org owner can invite manager + employee
    // Manager can only invite employee
    if (inviter.role === 'manager' && role === 'manager') {
      throw new Error('Managers can only invite employees, not other managers.');
    }

    if (inviter.role === 'employee') {
      throw new Error('Employees cannot invite team members.');
    }

    // Inviter must belong to the target org
    if (inviter.organizationId !== organizationId) {
      throw new Error('You can only invite to your own organization.');
    }

    // Check if email already belongs to a user in this org
    const existingUser = await prisma.user.findFirst({
      where: { email, organizationId },
    });

    if (existingUser) {
      throw new Error('This user is already a member of your organization.');
    }

    // Check for existing valid pending invite
    const existingInvite = await prisma.orgInvite.findFirst({
      where: {
        email,
        organizationId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      // Return existing invite instead of creating a duplicate
      return existingInvite;
    }

    // Expire any old pending invites for this email in this org
    await prisma.orgInvite.updateMany({
      where: {
        email,
        organizationId,
        status: 'pending',
      },
      data: { status: 'expired' },
    });

    // Create new invite with 7-day expiry
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.orgInvite.create({
      data: {
        organizationId,
        invitedById,
        email,
        role,
        token,
        expiresAt,
        status: 'pending',
        tokensAllocated: tokensAllocated || 0,
      },
      include: {
        organization: true,
        invitedBy: {
          select: { name: true, email: true },
        },
      },
    });

    // Send invite email (fire-and-forget)
    EmailService.sendInviteEmail({
      recipientEmail: email,
      inviterName: invite.invitedBy.name,
      orgName: invite.organization.name,
      role,
      inviteToken: token,
      tokensAllocated,
      expiresAt,
    }).catch(() => {});

    // Log activity
    try {
      await (prisma as any).activityLog.create({
        data: {
          organizationId,
          actorId: invitedById,
          action: 'member_invited',
          details: { email, role, tokensAllocated: tokensAllocated || 0 },
        },
      });
    } catch { /* activity log is optional */ }

    logger.info(`Invite created: org=${organizationId} email=${email} role=${role} tokens=${tokensAllocated || 0}`);
    return invite;
  }

  /**
   * Validate an invite token. Throws descriptive errors for bad states.
   */
  static async validateToken(token: string) {
    const invite = await prisma.orgInvite.findUnique({
      where: { token },
      include: {
        organization: true,
        invitedBy: {
          select: { name: true, email: true },
        },
      },
    });

    if (!invite) {
      throw new Error('Invalid invite link.');
    }

    if (invite.status === 'accepted') {
      throw new Error('This invite has already been used.');
    }

    if (invite.status === 'revoked') {
      throw new Error('This invite has been revoked by the organization.');
    }

    if (invite.status === 'expired' || invite.expiresAt < new Date()) {
      // Mark as expired if not already
      if (invite.status !== 'expired') {
        await prisma.orgInvite.update({
          where: { id: invite.id },
          data: { status: 'expired' },
        });
      }
      throw new Error('This invite link has expired. Please request a new one.');
    }

    return invite;
  }

  /**
   * Accept an invite — joins the user to the organization with the invite's role.
   */
  static async acceptInvite(params: { token: string; userId: string }) {
    const { token, userId } = params;

    const invite = await this.validateToken(token);

    // If inviter is a manager, set managerId on the new employee
    const inviter = await prisma.user.findUnique({ where: { id: invite.invitedById } });
    const managerId = inviter?.role === 'manager' ? invite.invitedById : undefined;

    // Update user to join org with the invited role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        organizationId: invite.organizationId,
        role: invite.role,
        ...(managerId ? { managerId } : {}),
      },
    });

    // Mark invite as accepted
    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedById: userId,
      },
    });

    // Allocate tokens if specified on the invite
    const tokensToAllocate = (invite as any).tokensAllocated || 0;
    if (tokensToAllocate > 0) {
      try {
        const pool = await prisma.tokenPool.findUnique({
          where: { organizationId: invite.organizationId },
        });

        if (pool && pool.availableTokens >= tokensToAllocate) {
          const now = new Date();
          const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

          await prisma.$transaction([
            prisma.tokenAllocation.create({
              data: {
                assignedById: invite.invitedById,
                assignedToId: userId,
                organizationId: invite.organizationId,
                tokensAllocated: tokensToAllocate,
                tokensRemaining: tokensToAllocate,
                periodStart: now,
                periodEnd,
              },
            }),
            prisma.tokenPool.update({
              where: { organizationId: invite.organizationId },
              data: {
                allocatedTokens: { increment: tokensToAllocate },
                availableTokens: { decrement: tokensToAllocate },
              },
            }),
          ]);

          logger.info(`Tokens allocated on invite accept: ${tokensToAllocate} to user=${userId}`);
        }
      } catch (err) {
        logger.warn('Failed to allocate invite tokens:', err);
      }
    }

    // Notify the inviter (in-app)
    try {
      await prisma.notification.create({
        data: {
          userId: invite.invitedById,
          type: 'team_member_joined',
          title: 'New team member joined',
          message: `${updatedUser.name} accepted your invite and joined as ${invite.role}`,
          referenceId: invite.organizationId,
          referenceType: 'organization',
        },
      });
    } catch (err) {
      logger.warn('Failed to create invite-accepted notification', err);
    }

    // Send email to org owner (fire-and-forget)
    try {
      const org = await prisma.organization.findUnique({
        where: { id: invite.organizationId },
        include: { owner: { select: { email: true, name: true } } },
      });
      if (org) {
        EmailService.sendMemberJoinedEmail({
          ownerEmail: org.owner.email,
          ownerName: org.owner.name,
          newMemberName: updatedUser.name,
          newMemberEmail: updatedUser.email,
          newMemberRole: invite.role,
          orgName: org.name,
        }).catch(() => {});
      }
    } catch { /* email notification is optional */ }

    // Log activity
    try {
      await (prisma as any).activityLog.create({
        data: {
          organizationId: invite.organizationId,
          actorId: userId,
          action: 'member_joined',
          details: { role: invite.role, invitedBy: invite.invitedById, tokensAllocated: tokensToAllocate },
        },
      });
    } catch { /* activity log is optional */ }

    logger.info(`Invite accepted: org=${invite.organizationId} userId=${userId} role=${invite.role}`);
    return invite;
  }

  /**
   * Revoke a pending invite.
   */
  static async revokeInvite(params: { inviteId: string; requesterId: string }) {
    const { inviteId, requesterId } = params;

    const invite = await prisma.orgInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) throw new Error('Invite not found');

    if (invite.status !== 'pending') {
      throw new Error(`Cannot revoke an invite that is already ${invite.status}.`);
    }

    // Only org owner, platform admin, or the person who created the invite can revoke
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester) throw new Error('Requester not found');

    const canRevoke =
      requester.role === 'org_owner' ||
      requester.role === 'platform_admin' ||
      invite.invitedById === requesterId;

    if (!canRevoke) {
      throw new Error('You do not have permission to revoke this invite.');
    }

    await prisma.orgInvite.update({
      where: { id: inviteId },
      data: { status: 'revoked' },
    });

    logger.info(`Invite revoked: inviteId=${inviteId} by=${requesterId}`);
  }
}

export default InviteService;
