import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AdminStats, OrganizationUserTree, UserUsageStats, OrganizationUsageStats, UserInHierarchy } from '../types/index.js';
import { isValidUUID } from '../utils/validators.js';
import logger from '../config/logger.js';
import { TokenWalletService } from '../services/tokenWalletService.js';


export const getAdminStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  // Get new users this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Use aggregations instead of loading all records into memory
  const [
    totalUsers,
    totalOrganizations,
    totalQueries,
    activeSubscriptions,
    newUsersThisMonth,
    usageAggregates,
    revenueAggregates,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.usageLog.count(),
    prisma.subscription.count({ where: { status: 'active' } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.usageLog.aggregate({
      _sum: { tokensInput: true, tokensOutput: true, customerPrice: true },
    }),
    prisma.billingRecord.aggregate({
      _sum: { amount: true },
      where: { status: 'paid' },
    }),
  ]);

  const totalTokensUsed =
    (usageAggregates._sum.tokensInput || 0) +
    (usageAggregates._sum.tokensOutput || 0);
  const totalRevenue = revenueAggregates._sum.amount || 0;

  // Get top models using groupBy with proper field reference
  const topModels = await prisma.usageLog.groupBy({
    by: ['modelId'],
    _count: { id: true },
    _sum: { customerPrice: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  const topModelsData = await Promise.all(
    topModels.map(async (model: any) => {
      const dbModel = await prisma.aIModel.findUnique({
        where: { id: model.modelId },
      });
      return {
        modelName: dbModel?.name || 'Unknown',
        usageCount: model._count.id,
        revenue: parseFloat(((model._sum.customerPrice || 0) as number).toFixed(4)),
      };
    })
  );

  const stats: AdminStats = {
    totalUsers,
    totalOrganizations,
    totalQueries,
    totalTokensUsed,
    totalRevenue: parseFloat(totalRevenue.toFixed(4)),
    activeSubscriptions,
    newUsersThisMonth,
    topModels: topModelsData,
  };

  res.json({
    success: true,
    statusCode: 200,
    message: 'Admin statistics retrieved',
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { page = '1', limit = '20', search = '' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const searchStr = String(search).trim();

  const where = searchStr ? {
    OR: [
      { name: { contains: searchStr, mode: 'insensitive' as const } },
      { email: { contains: searchStr, mode: 'insensitive' as const } },
    ],
  } : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        isVerified: true,
        avatar: true,
        createdAt: true,
        organization: {
          select: {
            name: true,
          },
        },
      },
      skip,
      take: parseInt(limit as string),
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Users retrieved',
    data: users,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      pages: Math.ceil(total / parseInt(limit as string)),
    },
    timestamp: new Date().toISOString(),
  });
});

export const getOrganizations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { page = '1', limit = '20', search = '' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const searchStr = String(search).trim();

  const where = searchStr ? {
    OR: [
      { name: { contains: searchStr, mode: 'insensitive' as const } },
      { email: { contains: searchStr, mode: 'insensitive' as const } },
    ],
  } : {};

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        tier: true,
        status: true,
        industry: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
          },
        },
      },
      skip,
      take: parseInt(limit as string),
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.organization.count({ where }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organizations retrieved',
    data: organizations,
    pagination: {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      total,
      pages: Math.ceil(total / parseInt(limit as string)),
    },
    timestamp: new Date().toISOString(),
  });
});

export const getSystemHealth = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  res.json({
    success: true,
    statusCode: 200,
    message: 'System is healthy',
    data: {
      status: 'ok',
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * NEW ADMIN FUNCTIONS
 */

export const getOrganizationUsers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const orgId = req.params.orgId;

  if (!isValidUUID(orgId)) {
    throw new AppError('Invalid organization ID format', 400);
  }

  const { page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  // Get all users in organization with pagination
  const [allUsers, total] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId },
      include: {
        employees: true,
        manager: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: { organizationId: orgId } }),
  ]);

  // Build hierarchy tree for managers (exclude employees from main list)
  const buildHierarchy = (user: any): UserInHierarchy => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    employees:
      user.employees && user.employees.length > 0
        ? user.employees.map((emp: any) => ({
            id: emp.id,
            email: emp.email,
            name: emp.name,
            role: emp.role,
          }))
        : undefined,
  });

  const hierarchy = allUsers.map((user: any) => buildHierarchy(user));

  const response: OrganizationUserTree = {
    organizationId: org.id,
    organizationName: org.name,
    totalUsers: total,
    hierarchy,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: total,
      pages: Math.ceil(total / limitNum),
    },
  };

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization users hierarchy retrieved',
    data: response,
    timestamp: new Date().toISOString(),
  });
});

export const getUserUsageStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const userId = req.params.userId;
  const { startDate, endDate } = req.query;

  if (!isValidUUID(userId)) {
    throw new AppError('Invalid user ID format', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Build date filter
  const dateFilter: any = {};
  if (startDate) {
    dateFilter.createdAt = { gte: new Date(startDate as string) };
  }
  if (endDate) {
    if (!dateFilter.createdAt) {
      dateFilter.createdAt = {};
    }
    (dateFilter.createdAt as any).lte = new Date(endDate as string);
  }

  // Get usage logs for the user
  const usageLogs = await prisma.usageLog.findMany({
    where: {
      userId,
      ...dateFilter,
    },
    include: {
      model: {
        select: {
          id: true,
          name: true,
          provider: true,
          modelId: true,
          description: true,
          inputTokenPrice: true,
          outputTokenPrice: true,
          capabilities: true,
          contextWindow: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        }
      }
    },
  });

  // Calculate aggregate stats
  const totalQueries = usageLogs.length;
  const totalTokensUsed = usageLogs.reduce((sum: number, log: any) => sum + log.tokensInput + log.tokensOutput, 0);
  const totalCost = usageLogs.reduce((sum: number, log: any) => sum + log.customerPrice, 0);

  // Group by model
  const modelStats = new Map<string, { modelName: string; usageCount: number; tokensCost: number; tokensUsed: number }>();
  usageLogs.forEach((log: any) => {
    const key = log.model.name;
    if (!modelStats.has(key)) {
      modelStats.set(key, { modelName: key, usageCount: 0, tokensCost: 0, tokensUsed: 0 });
    }
    const stat = modelStats.get(key)!;
    stat.usageCount += 1;
    stat.tokensCost += log.customerPrice;
    stat.tokensUsed += log.tokensInput + log.tokensOutput;
  });

  // Group by day
  const dailyStats = new Map<string, { date: string; queries: number; tokensUsed: number; cost: number }>();
  usageLogs.forEach((log: any) => {
    const date = log.createdAt.toISOString().split('T')[0];
    if (!dailyStats.has(date)) {
      dailyStats.set(date, { date, queries: 0, tokensUsed: 0, cost: 0 });
    }
    const stat = dailyStats.get(date)!;
    stat.queries += 1;
    stat.tokensUsed += log.tokensInput + log.tokensOutput;
    stat.cost += log.customerPrice;
  });

  const stats: UserUsageStats = {
    userId: user.id,
    email: user.email,
    name: user.name,
    totalQueries,
    totalTokensUsed,
    totalCost: Math.round(totalCost * 100) / 100,
    topModels: Array.from(modelStats.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5)
      .map(({ tokensUsed, ...rest }) => rest),
    dailyBreakdown: Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };

  res.json({
    success: true,
    statusCode: 200,
    message: 'User usage statistics retrieved',
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

// ── Model Pricing Management ──

export const getAdminModels = asyncHandler(async (req: Request, res: Response) => {
  const models = await prisma.aIModel.findMany({
    orderBy: [{ provider: 'asc' }, { name: 'asc' }],
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Models retrieved',
    data: models,
    timestamp: new Date().toISOString(),
  });
});

export const updateModelPricing = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { inputTokenPrice, outputTokenPrice, markupPercentage } = req.body;

  if (!isValidUUID(id)) {
    throw new AppError('Invalid model ID format', 400);
  }

  if (typeof inputTokenPrice !== 'number' || inputTokenPrice <= 0) {
    throw new AppError('inputTokenPrice must be a positive number', 400);
  }
  if (typeof outputTokenPrice !== 'number' || outputTokenPrice <= 0) {
    throw new AppError('outputTokenPrice must be a positive number', 400);
  }
  if (typeof markupPercentage !== 'number' || markupPercentage < 0 || markupPercentage > 200) {
    throw new AppError('markupPercentage must be between 0 and 200', 400);
  }

  const model = await prisma.aIModel.findUnique({ where: { id } });
  if (!model) {
    throw new AppError('Model not found', 404);
  }

  const updated = await prisma.aIModel.update({
    where: { id },
    data: { inputTokenPrice, outputTokenPrice, markupPercentage },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Model pricing updated',
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

export const updateModelMarkup = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { markupPercentage } = req.body;

  if (!isValidUUID(id)) {
    throw new AppError('Invalid model ID format', 400);
  }

  if (typeof markupPercentage !== 'number' || markupPercentage < 0 || markupPercentage > 200) {
    throw new AppError('markupPercentage must be between 0 and 200', 400);
  }

  const model = await prisma.aIModel.findUnique({ where: { id } });
  if (!model) {
    throw new AppError('Model not found', 404);
  }

  const updated = await prisma.aIModel.update({
    where: { id },
    data: { markupPercentage },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Model markup updated',
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

export const toggleModel = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    throw new AppError('Invalid model ID format', 400);
  }

  const model = await prisma.aIModel.findUnique({ where: { id } });
  if (!model) {
    throw new AppError('Model not found', 404);
  }

  const updated = await prisma.aIModel.update({
    where: { id },
    data: { isActive: !model.isActive },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: `Model ${updated.isActive ? 'activated' : 'deactivated'}`,
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

export const getOrgUsageStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const orgId = req.params.orgId;
  const { startDate, endDate } = req.query;

  if (!isValidUUID(orgId)) {
    throw new AppError('Invalid organization ID format', 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  // Build date filter
  const dateFilter: any = {};
  if (startDate) {
    dateFilter.createdAt = { gte: new Date(startDate as string) };
  }
  if (endDate) {
    if (!dateFilter.createdAt) {
      dateFilter.createdAt = {};
    }
    (dateFilter.createdAt as any).lte = new Date(endDate as string);
  }

  // Get usage logs for the organization
  const [usageLogs, userCount] = await Promise.all([
    prisma.usageLog.findMany({
      where: {
        organizationId: orgId,
        ...dateFilter,
      },
      include: { model: true, user: true },
    }),
    prisma.user.count({ where: { organizationId: orgId } }),
  ]);

  // Calculate aggregate stats
  const totalQueries = usageLogs.length;
  const totalTokensUsed = usageLogs.reduce((sum: number, log: any) => sum + log.tokensInput + log.tokensOutput, 0);
  const totalCost = usageLogs.reduce((sum: number, log: any) => sum + log.customerPrice, 0);

  // Get top users
  const userMap = new Map<string, { userId: string; email: string; name: string; queries: number; cost: number }>();
  usageLogs.forEach((log: any) => {
    const key = log.userId;
    if (!userMap.has(key)) {
      userMap.set(key, {
        userId: log.userId,
        email: log.user.email,
        name: log.user.name,
        queries: 0,
        cost: 0,
      });
    }
    const stat = userMap.get(key)!;
    stat.queries += 1;
    stat.cost += log.customerPrice;
  });

  // Get top models
  const modelMap = new Map<string, { modelName: string; usageCount: number; totalCost: number }>();
  usageLogs.forEach((log: any) => {
    const key = log.model.name;
    if (!modelMap.has(key)) {
      modelMap.set(key, { modelName: key, usageCount: 0, totalCost: 0 });
    }
    const stat = modelMap.get(key)!;
    stat.usageCount += 1;
    stat.totalCost += log.customerPrice;
  });

  // Get daily breakdown
  const dailyMap = new Map<string, { date: string; queries: number; cost: number }>();
  usageLogs.forEach((log: any) => {
    const date = log.createdAt.toISOString().split('T')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, queries: 0, cost: 0 });
    }
    const stat = dailyMap.get(date)!;
    stat.queries += 1;
    stat.cost += log.customerPrice;
  });

  const stats: OrganizationUsageStats = {
    organizationId: org.id,
    organizationName: org.name,
    totalUsers: userCount,
    totalQueries,
    totalTokensUsed,
    totalCost: Math.round(totalCost * 100) / 100,
    topUsers: Array.from(userMap.values())
      .sort((a, b) => b.queries - a.queries)
      .slice(0, 10),
    topModels: Array.from(modelMap.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5),
    dailyBreakdown: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization usage statistics retrieved',
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

// ============ DELETE /api/admin/users/:userId — Permanently delete user ============
export const deleteUserPermanently = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { userId } = req.params;
  if (!isValidUUID(userId)) throw new AppError('Invalid user ID', 400);

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AppError('User not found', 404);

  // Cannot delete platform admins
  if (target.role === 'platform_admin') {
    throw new AppError('Cannot delete platform admins', 403);
  }

  // If user owns an organization, transfer ownership or delete org
  if (target.role === 'org_owner') {
    const ownedOrgs = await prisma.organization.findMany({ where: { ownerId: userId } });
    for (const org of ownedOrgs) {
      // Find another member to transfer ownership to
      const nextOwner = await prisma.user.findFirst({
        where: { organizationId: org.id, id: { not: userId }, role: { in: ['manager', 'employee'] } },
        orderBy: { role: 'asc' }, // prefer managers
      });
      if (nextOwner) {
        await prisma.organization.update({ where: { id: org.id }, data: { ownerId: nextOwner.id } });
        await prisma.user.update({ where: { id: nextOwner.id }, data: { role: 'org_owner' } });
      } else {
        // No other members — remove org reference from all users, then delete org
        await prisma.user.updateMany({ where: { organizationId: org.id }, data: { organizationId: null } });
        // Delete org-related data
        await prisma.tokenAllocation.deleteMany({ where: { organizationId: org.id } });
        await prisma.orgInvite.deleteMany({ where: { organizationId: org.id } });
        await prisma.activityLog.deleteMany({ where: { organizationId: org.id } });
        const pool = await (prisma as any).tokenPool?.findUnique({ where: { organizationId: org.id } });
        if (pool) await (prisma as any).tokenPool.delete({ where: { organizationId: org.id } });
        await prisma.organization.delete({ where: { id: org.id } });
      }
    }
  }

  // Delete all user-related data
  const p = prisma as any;
  await Promise.allSettled([
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
    p.orgInvite?.deleteMany({ where: { OR: [{ invitedById: userId }, { acceptedById: userId }] } }),
    p.activityLog?.deleteMany({ where: { OR: [{ actorId: userId }, { targetId: userId }] } }),
    p.review?.deleteMany({ where: { userId } }),
    p.billingRecord?.deleteMany({ where: { userId } }),
    p.tokenPurchase?.deleteMany({ where: { userId } }),
    p.budget?.deleteMany({ where: { userId } }),
    p.subscription?.deleteMany({ where: { userId } }),
    p.tokenAllocation?.deleteMany({ where: { OR: [{ assignedToId: userId }, { assignedById: userId }] } }),
    p.agent?.deleteMany({ where: { userId } }),
  ]);

  // Delete wallet
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
    await prisma.wallet.delete({ where: { userId } });
  }
  await prisma.tokenWallet.deleteMany({ where: { userId } });

  // Clear manager references
  await prisma.user.updateMany({ where: { managerId: userId }, data: { managerId: null } });

  // Delete the user
  await prisma.user.delete({ where: { id: userId } });

  res.json({
    success: true,
    statusCode: 200,
    message: `User ${target.email} permanently deleted`,
    timestamp: new Date().toISOString(),
  });
});

// ── Change User Role ────────────────────────────────────────────────

export const changeUserRole = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { userId } = req.params;
  const { role } = req.body;
  if (!isValidUUID(userId)) throw new AppError('Invalid user ID', 400);

  const validRoles = ['employee', 'manager', 'org_owner', 'platform_admin'];
  if (!role || !validRoles.includes(role)) {
    throw new AppError(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400);
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AppError('User not found', 404);

  // Only platform_admin can promote to platform_admin
  if (role === 'platform_admin' && req.user.role !== 'platform_admin') {
    throw new AppError('Only platform admins can promote to platform_admin', 403);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  logger.info(`Admin ${req.user.userId} changed role of ${target.email} from ${target.role} to ${role}`);

  res.json({
    success: true,
    statusCode: 200,
    message: `${target.name}'s role changed to ${role}`,
    timestamp: new Date().toISOString(),
  });
});

// ── Suspend Organization ────────────────────────────────────────────

export const suspendOrganization = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { orgId } = req.params;
  if (!isValidUUID(orgId)) throw new AppError('Invalid organization ID', 400);

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new AppError('Organization not found', 404);

  const newStatus = org.status === 'active' ? 'suspended' : 'active';
  await prisma.organization.update({
    where: { id: orgId },
    data: { status: newStatus },
  });

  logger.info(`Admin ${req.user.userId} ${newStatus === 'suspended' ? 'suspended' : 'reactivated'} org ${org.name}`);

  res.json({
    success: true,
    statusCode: 200,
    message: `Organization ${org.name} ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`,
    data: { status: newStatus },
    timestamp: new Date().toISOString(),
  });
});

// ── Delete Organization ─────────────────────────────────────────────

export const deleteOrganization = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { orgId } = req.params;
  if (!isValidUUID(orgId)) throw new AppError('Invalid organization ID', 400);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { _count: { select: { users: true } } },
  });
  if (!org) throw new AppError('Organization not found', 404);

  // Detach all users from the org first
  await prisma.user.updateMany({
    where: { organizationId: orgId },
    data: { organizationId: null, role: 'user' },
  });

  // Delete org-related data
  await Promise.allSettled([
    prisma.budget.deleteMany({ where: { organizationId: orgId } }),
    prisma.usageLog.deleteMany({ where: { organizationId: orgId } }),
    prisma.billingRecord.deleteMany({ where: { organizationId: orgId } }),
    prisma.subscription.deleteMany({ where: { organizationId: orgId } }),
    prisma.tokenPurchase.deleteMany({ where: { organizationId: orgId } }),
    prisma.tokenAllocation.deleteMany({ where: { organizationId: orgId } }),
    prisma.activityLog.deleteMany({ where: { organizationId: orgId } }),
    prisma.orgInvite.deleteMany({ where: { organizationId: orgId } }),
    prisma.agent.deleteMany({ where: { organizationId: orgId } }),
    prisma.aPIKey.deleteMany({ where: { organizationId: orgId } }),
  ]);

  // Delete the org
  await prisma.organization.delete({ where: { id: orgId } });

  logger.info(`Admin ${req.user.userId} deleted org ${org.name} (${org.id}) with ${org._count.users} members`);

  res.json({
    success: true,
    statusCode: 200,
    message: `Organization ${org.name} deleted. ${org._count.users} members detached.`,
    timestamp: new Date().toISOString(),
  });
});

// ── Revenue Dashboard (alias for /usage/admin) ─────────────────────

export const getRevenueDashboard = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalRevenue, totalCost, dailyRevenue, providerBreakdown, topOrgs, topPersonalUsersRaw] = await Promise.all([
    // Total revenue (customer price)
    prisma.usageLog.aggregate({
      _sum: { customerPrice: true },
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    // Total provider cost
    prisma.usageLog.aggregate({
      _sum: { providerCost: true },
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
    // Daily revenue for chart
    prisma.$queryRaw`
      SELECT DATE("createdAt") as date,
        SUM("customerPrice") as revenue,
        SUM("providerCost") as cost
      FROM "UsageLog"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date
    ` as Promise<any[]>,
    // Revenue by provider
    prisma.$queryRaw`
      SELECT m.provider,
        SUM(u."customerPrice") as revenue,
        COUNT(*)::int as queries
      FROM "UsageLog" u
      JOIN "AIModel" m ON u."modelId" = m.id
      WHERE u."createdAt" >= ${thirtyDaysAgo}
      GROUP BY m.provider
      ORDER BY revenue DESC
    ` as Promise<any[]>,
    // Top orgs (real organizations, exclude "Personal")
    prisma.$queryRaw`
      SELECT o.name, o.id,
        SUM(u."customerPrice") as revenue,
        COUNT(*)::int as queries
      FROM "UsageLog" u
      JOIN "Organization" o ON u."organizationId" = o.id
      WHERE u."createdAt" >= ${thirtyDaysAgo}
        AND LOWER(o.name) != 'personal'
      GROUP BY o.id, o.name
      ORDER BY revenue DESC
      LIMIT 10
    ` as Promise<any[]>,
    // Top personal users
    prisma.$queryRaw`
      SELECT usr.id as "userId", usr.name, usr.email,
        SUM(u."customerPrice") as revenue,
        COUNT(*)::int as queries
      FROM "UsageLog" u
      JOIN "User" usr ON u."userId" = usr.id
      LEFT JOIN "Organization" o ON u."organizationId" = o.id
      WHERE u."createdAt" >= ${thirtyDaysAgo}
        AND (u."organizationId" IS NULL OR LOWER(o.name) = 'personal')
      GROUP BY usr.id, usr.name, usr.email
      ORDER BY revenue DESC
      LIMIT 10
    ` as Promise<any[]>,
  ]);

  const revenue = Number(totalRevenue._sum.customerPrice || 0);
  const cost = Number(totalCost._sum.providerCost || 0);

  res.json({
    success: true,
    data: {
      revenue,
      cost,
      profit: revenue - cost,
      profitMargin: revenue > 0 ? ((revenue - cost) / revenue * 100).toFixed(1) : '0',
      dailyRevenue: dailyRevenue.map((d: any) => ({
        date: d.date,
        revenue: Number(d.revenue || 0),
        cost: Number(d.cost || 0),
      })),
      providerBreakdown: providerBreakdown.map((p: any) => ({
        provider: p.provider,
        revenue: Number(p.revenue || 0),
        queries: p.queries,
      })),
      topOrgs: topOrgs.map((o: any) => ({
        name: o.name,
        id: o.id,
        revenue: Number(o.revenue || 0),
        queries: o.queries,
      })),
      topPersonalUsers: topPersonalUsersRaw.map((u: any) => ({
        userId: u.userId,
        name: u.name || u.email,
        email: u.email,
        revenue: Number(u.revenue || 0),
        queries: u.queries,
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Admin Create Account ─────────────────────────────────────────────

export const adminCreateAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { email, name, password, accountType, organizationName, industry, role } = req.body;

  if (!email || !name || !password) {
    throw new AppError('email, name, and password are required', 400);
  }
  if (password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('User already exists with this email', 400);
  }

  const bcryptLib = (await import('bcryptjs')).default;
  const hashedPassword = await bcryptLib.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    let organizationId: string | undefined;
    const resolvedRole = accountType === 'organization' ? 'org_owner' : (role || 'user');

    const user = await tx.user.create({
      data: { email, name, password: hashedPassword, role: resolvedRole, isVerified: true },
    });

    if (accountType === 'organization' && organizationName) {
      const org = await tx.organization.create({
        data: { name: organizationName, email, ownerId: user.id, ...(industry ? { industry } : {}) },
      });
      organizationId = org.id;
      await tx.user.update({ where: { id: user.id }, data: { organizationId } });
    }

    await tx.wallet.create({
      data: { userId: user.id, balance: 0, totalToppedUp: 0, totalSpent: 0, currency: 'USD' },
    });
    await tx.tokenWallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, tokenBalance: 0, totalTokensPurchased: 0, totalTokensUsed: 0 },
    });

    return { ...user, organizationId: organizationId || null };
  });

  logger.info(`Admin created account: ${result.email} (${accountType}) by ${req.user.userId}`);

  res.status(201).json({
    success: true,
    message: `Account created for ${result.email}`,
    data: { id: result.id, email: result.email, name: result.name, role: result.role, organizationId: result.organizationId },
    timestamp: new Date().toISOString(),
  });
});

// ── Admin Send Tokens ────────────────────────────────────────────────

export const adminSendTokens = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { targetUserId, targetOrgId, tokens, reason } = req.body;

  if (!tokens || parseInt(tokens) <= 0) {
    throw new AppError('tokens must be a positive number', 400);
  }
  if (!targetUserId && !targetOrgId) {
    throw new AppError('Either targetUserId or targetOrgId is required', 400);
  }

  const parsedTokens = parseInt(tokens);

  if (targetUserId) {
    if (!isValidUUID(targetUserId)) throw new AppError('Invalid user ID', 400);
    const user = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new AppError('User not found', 404);

    await TokenWalletService.addTokens({
      userId: targetUserId,
      tokens: parsedTokens,
      reference: `admin_grant_${Date.now()}`,
      description: reason || `Admin token grant by ${req.user.userId}`,
    });

    logger.info(`Admin sent ${parsedTokens} tokens to user ${user.email}`);
    const balance = await TokenWalletService.getBalance(targetUserId);

    res.json({
      success: true,
      message: `${parsedTokens.toLocaleString()} tokens sent to ${user.email}`,
      data: { targetEmail: user.email, tokensSent: parsedTokens, newBalance: balance.tokenBalance },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (targetOrgId) {
    if (!isValidUUID(targetOrgId)) throw new AppError('Invalid org ID', 400);
    const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!org) throw new AppError('Organization not found', 404);

    const members = await prisma.user.findMany({
      where: { organizationId: targetOrgId },
      select: { id: true },
    });

    for (const member of members) {
      await TokenWalletService.addTokens({
        userId: member.id,
        tokens: parsedTokens,
        reference: `admin_org_grant_${Date.now()}`,
        description: reason || `Admin org token grant to ${org.name}`,
      });
    }

    logger.info(`Admin sent ${parsedTokens} tokens to ${members.length} members of ${org.name}`);

    res.json({
      success: true,
      message: `${parsedTokens.toLocaleString()} tokens sent to ${members.length} members of ${org.name}`,
      data: { orgName: org.name, memberCount: members.length, tokensPerMember: parsedTokens },
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Admin Full Analytics ─────────────────────────────────────────────

export const getAdminAnalytics = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['admin', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Admin access required', 403);
  }

  const { from, to } = req.query;
  const now = new Date();
  const fromDate = from ? new Date(from as string) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(to as string) : now;

  const dateFilter = { createdAt: { gte: fromDate, lte: toDate } };

  const [totalUsers, totalOrgs, activeUsers, usageLogs, tokenWallets, tokenTransactions] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.user.count({ where: { usageLogs: { some: dateFilter } } }),
    prisma.usageLog.findMany({
      where: dateFilter,
      select: {
        userId: true, organizationId: true, customerPrice: true, providerCost: true,
        tokensInput: true, tokensOutput: true, createdAt: true,
        model: { select: { name: true, provider: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.tokenWallet.findMany({
      select: { userId: true, tokenBalance: true, totalTokensPurchased: true, totalTokensUsed: true,
        user: { select: { name: true, email: true, organizationId: true } } },
    }),
    prisma.tokenTransaction.findMany({
      where: dateFilter,
      select: { type: true, tokens: true, createdAt: true, userId: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Aggregations
  const dailyMap = new Map<string, { queries: number; revenue: number; cost: number; tokens: number }>();
  let totalRevenue = 0, totalCostAgg = 0, totalTokensUsed = 0;
  const userAgg = new Map<string, { name: string; email: string; orgId: string | null; queries: number; cost: number; tokens: number }>();
  const modelAgg = new Map<string, { name: string; provider: string; queries: number; cost: number }>();
  const providerAgg = new Map<string, { queries: number; revenue: number; cost: number }>();

  for (const log of usageLogs) {
    const dateKey = log.createdAt.toISOString().split('T')[0];
    totalRevenue += log.customerPrice;
    totalCostAgg += log.providerCost;
    totalTokensUsed += log.tokensInput + log.tokensOutput;

    const d = dailyMap.get(dateKey);
    if (d) { d.queries++; d.revenue += log.customerPrice; d.cost += log.providerCost; d.tokens += log.tokensInput + log.tokensOutput; }
    else { dailyMap.set(dateKey, { queries: 1, revenue: log.customerPrice, cost: log.providerCost, tokens: log.tokensInput + log.tokensOutput }); }

    const u = userAgg.get(log.userId);
    if (u) { u.queries++; u.cost += log.customerPrice; u.tokens += log.tokensInput + log.tokensOutput; }
    else { userAgg.set(log.userId, { name: log.user.name, email: log.user.email, orgId: log.organizationId, queries: 1, cost: log.customerPrice, tokens: log.tokensInput + log.tokensOutput }); }

    const mKey = log.model.name;
    const m = modelAgg.get(mKey);
    if (m) { m.queries++; m.cost += log.customerPrice; }
    else { modelAgg.set(mKey, { name: log.model.name, provider: log.model.provider, queries: 1, cost: log.customerPrice }); }

    const p = providerAgg.get(log.model.provider);
    if (p) { p.queries++; p.revenue += log.customerPrice; p.cost += log.providerCost; }
    else { providerAgg.set(log.model.provider, { queries: 1, revenue: log.customerPrice, cost: log.providerCost }); }
  }

  // Token summary
  let totalTokenBalance = 0, totalTokensPurchased = 0, totalTokensSpent = 0;
  for (const w of tokenWallets) { totalTokenBalance += w.tokenBalance; totalTokensPurchased += w.totalTokensPurchased; totalTokensSpent += w.totalTokensUsed; }

  const tokenByType = new Map<string, number>();
  for (const t of tokenTransactions) { tokenByType.set(t.type, (tokenByType.get(t.type) || 0) + Math.abs(t.tokens)); }

  // Fill daily chart
  const dailyUsage = [];
  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    const entry = dailyMap.get(key);
    dailyUsage.push({ date: key, queries: entry?.queries || 0, revenue: parseFloat((entry?.revenue || 0).toFixed(4)), cost: parseFloat((entry?.cost || 0).toFixed(4)), tokens: entry?.tokens || 0 });
  }

  const topUsers = Array.from(userAgg.entries()).map(([id, u]) => ({ userId: id, ...u, cost: parseFloat(u.cost.toFixed(4)) })).sort((a, b) => b.cost - a.cost).slice(0, 20);
  const topModels = Array.from(modelAgg.values()).map((m) => ({ ...m, cost: parseFloat(m.cost.toFixed(4)) })).sort((a, b) => b.queries - a.queries);
  const providerBreakdown = Array.from(providerAgg.entries()).map(([provider, d]) => ({ provider, queries: d.queries, revenue: parseFloat(d.revenue.toFixed(4)), cost: parseFloat(d.cost.toFixed(4)), profit: parseFloat((d.revenue - d.cost).toFixed(4)) })).sort((a, b) => b.revenue - a.revenue);
  const topTokenHolders = tokenWallets.map((w) => ({ userId: w.userId, name: w.user.name, email: w.user.email, balance: w.tokenBalance, purchased: w.totalTokensPurchased, used: w.totalTokensUsed })).sort((a, b) => b.balance - a.balance).slice(0, 20);

  res.json({
    success: true,
    data: {
      overview: { totalUsers, totalOrgs, activeUsers, totalQueries: usageLogs.length, totalRevenue: parseFloat(totalRevenue.toFixed(4)), totalCost: parseFloat(totalCostAgg.toFixed(4)), totalProfit: parseFloat((totalRevenue - totalCostAgg).toFixed(4)), profitMargin: totalRevenue > 0 ? parseFloat(((totalRevenue - totalCostAgg) / totalRevenue * 100).toFixed(1)) : 0, totalTokensUsed },
      tokenSummary: { totalTokenBalance, totalTokensPurchased, totalTokensSpent, transactionsByType: Object.fromEntries(tokenByType) },
      dailyUsage, topUsers, topModels, providerBreakdown, topTokenHolders,
      dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
    },
    timestamp: new Date().toISOString(),
  });
});
