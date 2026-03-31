import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { AdminStats, OrganizationUserTree, UserUsageStats, OrganizationUsageStats, UserInHierarchy } from '../types/index.js';
import { isValidUUID } from '../utils/validators.js';


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

  const { page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
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
    prisma.user.count(),
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

  const { page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [organizations, total] = await Promise.all([
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        tier: true,
        status: true,
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
    prisma.organization.count(),
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

