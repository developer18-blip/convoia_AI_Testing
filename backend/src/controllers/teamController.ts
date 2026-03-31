import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { InviteService } from '../services/inviteService.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

// ── CREATE INVITE ──────────────────────────────
export const createInvite = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { email, role, tokensAllocated } = req.body;

  if (!email?.trim()) {
    throw new AppError('Email is required', 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Invalid email address', 400);
  }

  if (!role || !['manager', 'employee'].includes(role)) {
    throw new AppError('Role must be manager or employee', 400);
  }

  const parsedTokens = tokensAllocated ? parseInt(tokensAllocated, 10) : 0;
  if (parsedTokens < 0) {
    throw new AppError('tokensAllocated must be positive', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  if (!user?.organizationId) {
    throw new AppError('You must be part of an organization to invite members', 400);
  }

  const invite = await InviteService.createInvite({
    organizationId: user.organizationId,
    invitedById: user.id,
    email: email.toLowerCase().trim(),
    role,
    tokensAllocated: parsedTokens || undefined,
  });

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const inviteUrl = `${baseUrl}/join?token=${invite.token}`;

  logger.info(`Invite created: org=${user.organizationId} email=${email} role=${role}`);

  res.json({
    success: true,
    data: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      inviteUrl,
      token: invite.token,
      expiresAt: invite.expiresAt,
      status: invite.status,
    },
    message: 'Invite created successfully',
  });
});

// ── ACCEPT INVITE (authenticated user) ───────────
export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { token } = req.body;
  if (!token) throw new AppError('Invite token is required', 400);

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) throw new AppError('User not found', 404);

  if (user.organizationId) {
    throw new AppError('You are already a member of an organization. Leave it first to join another.', 400);
  }

  const invite = await InviteService.acceptInvite({
    token,
    userId: user.id,
  });

  // Fetch updated user
  const updatedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { organization: true },
  });

  res.json({
    success: true,
    message: `Successfully joined ${invite.organization.name} as ${invite.role}`,
    data: {
      organizationId: updatedUser?.organizationId,
      organizationName: updatedUser?.organization?.name,
      role: updatedUser?.role,
    },
  });
});

// ── GET INVITE BY TOKEN (public) ───────────────
export const getInviteByToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token) {
    throw new AppError('Token is required', 400);
  }

  const invite = await InviteService.validateToken(token);

  res.json({
    success: true,
    data: {
      organizationName: invite.organization.name,
      organizationIndustry: invite.organization.industry,
      role: invite.role,
      invitedBy: invite.invitedBy.name,
      expiresAt: invite.expiresAt,
    },
  });
});

// ── GET ALL INVITES FOR ORG ────────────────────
export const getOrgInvites = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  if (!user?.organizationId) {
    throw new AppError('Not part of an organization', 400);
  }

  // Only org_owner, manager, platform_admin can see invites
  if (!['org_owner', 'manager', 'platform_admin'].includes(user.role)) {
    throw new AppError('Access denied', 403);
  }

  const whereClause: Record<string, unknown> = {
    organizationId: user.organizationId,
  };

  // Manager only sees invites they created
  if (user.role === 'manager') {
    whereClause.invitedById = user.id;
  }

  const invites = await prisma.orgInvite.findMany({
    where: whereClause,
    include: {
      invitedBy: { select: { name: true, email: true } },
      acceptedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      invitedBy: inv.invitedBy.name,
      acceptedBy: inv.acceptedBy?.name ?? null,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    })),
  });
});

// ── REVOKE INVITE ──────────────────────────────
export const revokeInvite = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { inviteId } = req.params;

  await InviteService.revokeInvite({
    inviteId,
    requesterId: req.user.userId,
  });

  res.json({
    success: true,
    message: 'Invite revoked successfully',
  });
});

// ── RESEND INVITE ──────────────────────────────
export const resendInvite = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { inviteId } = req.params;

  const invite = await prisma.orgInvite.findUnique({
    where: { id: inviteId },
  });

  if (!invite) throw new AppError('Invite not found', 404);

  // Permission check — must be in same org
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  if (user?.organizationId !== invite.organizationId) {
    throw new AppError('Access denied', 403);
  }

  // Extend expiry by 7 more days
  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + 7);

  const updated = await prisma.orgInvite.update({
    where: { id: inviteId },
    data: {
      expiresAt: newExpiry,
      status: 'pending',
    },
  });

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const inviteUrl = `${baseUrl}/join?token=${updated.token}`;

  res.json({
    success: true,
    data: { inviteUrl, expiresAt: updated.expiresAt },
    message: 'Invite resent successfully',
  });
});

// ── GET TEAM MEMBERS ───────────────────────────
export const getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  if (!user?.organizationId) {
    throw new AppError('Not part of an organization', 400);
  }

  // Employee cannot see team
  if (user.role === 'employee') {
    throw new AppError('Access denied', 403);
  }

  // Build query based on role
  const whereClause: Record<string, unknown> = {
    organizationId: user.organizationId,
  };

  // Manager only sees their direct reports
  if (user.role === 'manager') {
    whereClause.managerId = user.id;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const members = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      isActive: true,
      createdAt: true,
      managerId: true,
      manager: { select: { name: true } },
      budgets: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      usageLogs: {
        where: { createdAt: { gte: startOfMonth } },
        select: {
          tokensInput: true,
          tokensOutput: true,
          customerPrice: true,
        },
      },
      _count: { select: { usageLogs: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const membersWithStats = members.map((member) => {
    const totalTokens = member.usageLogs.reduce(
      (sum, log) => sum + log.tokensInput + log.tokensOutput,
      0
    );
    const totalCost = member.usageLogs.reduce(
      (sum, log) => sum + log.customerPrice,
      0
    );
    const budget = member.budgets[0] ?? null;

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      isActive: member.isActive,
      joinedAt: member.createdAt,
      manager: member.manager?.name ?? null,
      stats: {
        totalQueries: member._count.usageLogs,
        monthlyTokens: totalTokens,
        monthlyCost: totalCost,
      },
      budget: budget
        ? {
            monthlyCap: budget.monthlyCap,
            currentUsage: budget.currentUsage,
            alertThreshold: budget.alertThreshold,
            percentUsed: budget.monthlyCap > 0 ? (budget.currentUsage / budget.monthlyCap) * 100 : 0,
          }
        : null,
    };
  });

  res.json({
    success: true,
    data: membersWithStats,
  });
});

// ── REMOVE TEAM MEMBER ─────────────────────────
export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { userId } = req.params;

  const requester = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    throw new AppError('User not found', 404);
  }

  // Cannot remove yourself
  if (userId === req.user.userId) {
    throw new AppError('You cannot remove yourself', 400);
  }

  // Must be in same org
  if (requester?.organizationId !== targetUser.organizationId) {
    throw new AppError('Access denied', 403);
  }

  // Only org_owner can remove managers
  if (targetUser.role === 'manager' && requester?.role !== 'org_owner') {
    throw new AppError('Only org owners can remove managers', 403);
  }

  // Cannot remove org_owner
  if (targetUser.role === 'org_owner') {
    throw new AppError('Cannot remove the organization owner', 403);
  }

  const hardDelete = req.query.permanent === 'true';

  if (hardDelete && requester?.role === 'org_owner') {
    // Hard delete — remove user and all their data from database
    // Use raw queries for tables that might have naming issues, then transaction for core
    const p = prisma as any;

    // Clean up all foreign key references (safe — ignore if table/column doesn't exist)
    const cleanups = [
      p.task?.deleteMany({ where: { OR: [{ assignedToId: userId }, { createdById: userId }] } }),
      p.subTask?.deleteMany({ where: { task: { OR: [{ assignedToId: userId }, { createdById: userId }] } } }),
      p.taskComment?.deleteMany({ where: { userId } }),
      p.notification?.deleteMany({ where: { userId } }),
      p.usageLog?.deleteMany({ where: { userId } }),
      p.tokenTransaction?.deleteMany({ where: { userId } }),
      p.chatMessage?.deleteMany({ where: { conversation: { userId } } }),
      p.conversation?.deleteMany({ where: { userId } }),
      p.userMemory?.deleteMany({ where: { userId } }),
      p.hourlySession?.deleteMany({ where: { userId } }),
      p.aPIKey?.deleteMany({ where: { userId } }),
      p.orgInvite?.deleteMany({ where: { invitedBy: userId } }),
      p.activityLog?.deleteMany({ where: { userId } }),
      p.review?.deleteMany({ where: { userId } }),
      p.billingRecord?.deleteMany({ where: { userId } }),
      p.tokenPurchase?.deleteMany({ where: { userId } }),
      p.budget?.deleteMany({ where: { userId } }),
      p.subscription?.deleteMany({ where: { userId } }),
      p.tokenAllocation?.deleteMany({ where: { userId } }),
    ].filter(Boolean);
    await Promise.allSettled(cleanups);

    // Delete wallet + its transactions
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (wallet) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
      await prisma.wallet.delete({ where: { userId } });
    }
    await prisma.tokenWallet.deleteMany({ where: { userId } });

    // Clear managerId references
    await prisma.user.updateMany({ where: { managerId: userId }, data: { managerId: null } });

    // Finally delete the user
    await prisma.user.delete({ where: { id: userId } });

    logger.info(`Member PERMANENTLY DELETED: userId=${userId} by=${req.user.userId}`);

    res.json({
      success: true,
      message: 'Member permanently deleted from database',
    });
  } else {
    // Soft remove — clear org association, keep account
    await prisma.user.update({
      where: { id: userId },
      data: {
        organizationId: null,
        managerId: null,
        role: 'user',
      },
    });

    // Notify the removed user
    try {
      await prisma.notification.create({
        data: {
          userId: targetUser.id,
          type: 'system_message',
          title: 'Removed from organization',
          message: 'You have been removed from the organization.',
        },
      });
    } catch (err) {
      logger.warn('Failed to create removal notification', err);
    }

    logger.info(`Member removed from org: userId=${userId} by=${req.user.userId}`);

    res.json({
      success: true,
      message: 'Member removed from organization',
    });
  }
});

// ── ASSIGN MANAGER TO EMPLOYEE ─────────────────
export const assignManager = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { userId, managerId } = req.body;

  const requester = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  if (requester?.role !== 'org_owner' && requester?.role !== 'platform_admin') {
    throw new AppError('Only org owners can assign managers', 403);
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  const manager = await prisma.user.findUnique({ where: { id: managerId } });

  if (!targetUser || !manager) {
    throw new AppError('User not found', 404);
  }

  if (
    targetUser.organizationId !== requester.organizationId ||
    manager.organizationId !== requester.organizationId
  ) {
    throw new AppError('Users must be in the same organization', 400);
  }

  if (manager.role !== 'manager') {
    throw new AppError('The assigned person must have manager role', 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { managerId },
  });

  res.json({
    success: true,
    message: 'Manager assigned successfully',
  });
});

// ── UPDATE MEMBER ROLE ─────────────────────────
export const updateMemberRole = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { userId } = req.params;
  const { role } = req.body;

  if (!['manager', 'employee'].includes(role)) {
    throw new AppError('Invalid role', 400);
  }

  const requester = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  if (requester?.role !== 'org_owner') {
    throw new AppError('Only org owners can change roles', 403);
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });

  if (!targetUser) {
    throw new AppError('User not found', 404);
  }

  if (targetUser.organizationId !== requester.organizationId) {
    throw new AppError('Access denied', 403);
  }

  // Cannot change own role
  if (targetUser.id === requester.id) {
    throw new AppError('You cannot change your own role', 400);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  res.json({
    success: true,
    message: `Role updated to ${role}`,
  });
});
