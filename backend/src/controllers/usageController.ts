import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { isValidUUID } from '../utils/validators.js';

// ============ HELPER: build date filter ============
function buildDateFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  const filter: any = {};
  if (startDate) filter.gte = new Date(startDate);
  if (endDate) filter.lte = new Date(endDate);
  return filter;
}

// ============ HELPER: start-of helpers ============
function startOfDay(d: Date = new Date()): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function startOfWeek(d: Date = new Date()): Date {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  s.setHours(0, 0, 0, 0);
  return s;
}

function startOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ============ 1. GET /api/usage/my ============
export const getMyUsage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const userId = req.user.userId;
  const {
    page = '1',
    limit = '20',
    modelId,
    startDate,
    endDate,
    status,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: any = { userId };

  if (modelId) {
    if (!isValidUUID(modelId as string)) {
      throw new AppError('Invalid model ID format', 400);
    }
    where.modelId = modelId;
  }

  const dateFilter = buildDateFilter(startDate as string, endDate as string);
  if (dateFilter) where.createdAt = dateFilter;

  if (status && ['completed', 'failed', 'pending'].includes(status as string)) {
    where.status = status;
  }

  // Month boundaries for summary
  const monthStart = startOfMonth();

  // Run queries in parallel
  const [logs, total, monthlySummary] = await Promise.all([
    prisma.usageLog.findMany({
      where,
      include: {
        model: { select: { id: true, name: true, provider: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.usageLog.count({ where }),
    prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _count: { id: true },
      _sum: {
        tokensInput: true,
        tokensOutput: true,
        customerPrice: true,
      },
    }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Usage history retrieved',
    data: {
      queries: logs.map((l) => ({
        id: l.id,
        model: l.model,
        tokensInput: l.tokensInput,
        tokensOutput: l.tokensOutput,
        totalTokens: l.totalTokens,
        customerPrice: l.customerPrice,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      monthlySummary: {
        totalQueries: monthlySummary._count.id,
        totalTokens:
          (monthlySummary._sum.tokensInput || 0) +
          (monthlySummary._sum.tokensOutput || 0),
        totalSpent: parseFloat(
          (monthlySummary._sum.customerPrice || 0).toFixed(4)
        ),
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 2. GET /api/usage/org/:orgId ============
export const getOrgUsage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { orgId } = req.params;
  if (!isValidUUID(orgId)) {
    throw new AppError('Invalid organization ID format', 400);
  }

  // Authorization: manager+ or admin
  const allowedRoles = ['manager', 'org_owner', 'admin', 'platform_admin'];
  if (!allowedRoles.includes(req.user.role)) {
    throw new AppError('Insufficient permissions', 403);
  }

  const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);
  if (!isAdmin && req.user.organizationId !== orgId) {
    throw new AppError('Unauthorized for this organization', 403);
  }

  const {
    page = '1',
    limit = '20',
    modelId,
    startDate,
    endDate,
    status,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = { organizationId: orgId };

  // Visibility: managers can only see their team's usage
  if (req.user.role === 'manager') {
    const employees = await prisma.user.findMany({
      where: { managerId: req.user.userId },
      select: { id: true },
    });
    const visibleUserIds = [req.user.userId, ...employees.map((e) => e.id)];
    where.userId = { in: visibleUserIds };
  }

  if (modelId) {
    if (!isValidUUID(modelId as string)) {
      throw new AppError('Invalid model ID format', 400);
    }
    where.modelId = modelId;
  }

  const dateFilter = buildDateFilter(startDate as string, endDate as string);
  if (dateFilter) where.createdAt = dateFilter;

  if (status && ['completed', 'failed', 'pending'].includes(status as string)) {
    where.status = status;
  }

  const [logs, total] = await Promise.all([
    prisma.usageLog.findMany({
      where,
      include: {
        model: { select: { id: true, name: true, provider: true } },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.usageLog.count({ where }),
  ]);

  // Aggregate per-member usage (from all matching logs, not just current page)
  const allLogs = await prisma.usageLog.findMany({
    where,
    select: {
      userId: true,
      tokensInput: true,
      tokensOutput: true,
      customerPrice: true,
      providerCost: true,
      modelId: true,
      model: { select: { name: true, provider: true } },
      user: { select: { id: true, email: true, name: true } },
    },
  });

  // Group by user
  const userMap = new Map<
    string,
    { user: { id: string; email: string; name: string }; queries: number; tokens: number; cost: number }
  >();
  // Group by model
  const modelMap = new Map<string, { name: string; provider: string; queries: number; cost: number }>();

  let totalOrgSpend = 0;

  for (const l of allLogs) {
    totalOrgSpend += l.customerPrice;

    // User aggregation
    const existing = userMap.get(l.userId);
    if (existing) {
      existing.queries += 1;
      existing.tokens += l.tokensInput + l.tokensOutput;
      existing.cost += l.customerPrice;
    } else {
      userMap.set(l.userId, {
        user: l.user,
        queries: 1,
        tokens: l.tokensInput + l.tokensOutput,
        cost: l.customerPrice,
      });
    }

    // Model aggregation
    const mKey = l.modelId;
    const mExisting = modelMap.get(mKey);
    if (mExisting) {
      mExisting.queries += 1;
      mExisting.cost += l.customerPrice;
    } else {
      modelMap.set(mKey, {
        name: l.model.name,
        provider: l.model.provider,
        queries: 1,
        cost: l.customerPrice,
      });
    }
  }

  const memberUsage = Array.from(userMap.values())
    .sort((a, b) => b.cost - a.cost)
    .map((m) => ({
      ...m,
      cost: parseFloat(m.cost.toFixed(4)),
    }));

  const topModels = Array.from(modelMap.values())
    .sort((a, b) => b.queries - a.queries)
    .slice(0, 10)
    .map((m) => ({ ...m, cost: parseFloat(m.cost.toFixed(4)) }));

  const avgCostPerQuery = allLogs.length > 0 ? totalOrgSpend / allLogs.length : 0;

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization usage retrieved',
    data: {
      queries: logs.map((l) => ({
        id: l.id,
        user: l.user,
        model: l.model,
        tokensInput: l.tokensInput,
        tokensOutput: l.tokensOutput,
        totalTokens: l.totalTokens,
        customerPrice: l.customerPrice,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      summary: {
        totalQueries: allLogs.length,
        totalOrgSpend: parseFloat(totalOrgSpend.toFixed(4)),
        avgCostPerQuery: parseFloat(avgCostPerQuery.toFixed(6)),
        topModels,
      },
      memberUsage,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 3. GET /api/usage/dashboard ============
export const getDashboardUsage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const userId = req.user.userId;
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Run all aggregations in parallel
  const [
    todayAgg,
    weekAgg,
    monthAgg,
    last30DaysLogs,
  ] = await Promise.all([
    // Today
    prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: todayStart } },
      _count: { id: true },
      _sum: { customerPrice: true },
    }),
    // This week
    prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: weekStart } },
      _count: { id: true },
      _sum: { customerPrice: true },
    }),
    // This month
    prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _count: { id: true },
      _sum: { customerPrice: true },
    }),
    // Last 30 days — individual logs for chart + model + provider breakdown
    prisma.usageLog.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: {
        customerPrice: true,
        createdAt: true,
        modelId: true,
        model: { select: { name: true, provider: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Top 3 models
  const modelCounts = new Map<string, { name: string; count: number; cost: number }>();
  // Provider cost breakdown
  const providerCosts = new Map<string, number>();
  // Daily chart data
  const dailyMap = new Map<string, { queries: number; cost: number }>();

  for (const l of last30DaysLogs) {
    // Model counts
    const mc = modelCounts.get(l.modelId);
    if (mc) {
      mc.count += 1;
      mc.cost += l.customerPrice;
    } else {
      modelCounts.set(l.modelId, { name: l.model.name, count: 1, cost: l.customerPrice });
    }

    // Provider costs
    const pc = providerCosts.get(l.model.provider) || 0;
    providerCosts.set(l.model.provider, pc + l.customerPrice);

    // Daily
    const dateKey = l.createdAt.toISOString().split('T')[0];
    const dc = dailyMap.get(dateKey);
    if (dc) {
      dc.queries += 1;
      dc.cost += l.customerPrice;
    } else {
      dailyMap.set(dateKey, { queries: 1, cost: l.customerPrice });
    }
  }

  const topModels = Array.from(modelCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((m) => ({ name: m.name, queries: m.count, cost: parseFloat(m.cost.toFixed(4)) }));

  const costByProvider = Object.fromEntries(
    Array.from(providerCosts.entries()).map(([p, c]) => [p, parseFloat(c.toFixed(4))])
  );

  // Fill in missing days for smooth chart
  const dailyUsage: Array<{ date: string; queries: number; cost: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const entry = dailyMap.get(key);
    dailyUsage.push({
      date: key,
      queries: entry?.queries || 0,
      cost: parseFloat((entry?.cost || 0).toFixed(4)),
    });
  }

  res.json({
    success: true,
    statusCode: 200,
    message: 'Dashboard usage stats retrieved',
    data: {
      today: {
        queries: todayAgg._count.id,
        cost: parseFloat((todayAgg._sum.customerPrice || 0).toFixed(4)),
      },
      thisWeek: {
        queries: weekAgg._count.id,
        cost: parseFloat((weekAgg._sum.customerPrice || 0).toFixed(4)),
      },
      thisMonth: {
        queries: monthAgg._count.id,
        cost: parseFloat((monthAgg._sum.customerPrice || 0).toFixed(4)),
      },
      topModels,
      costByProvider,
      dailyUsage,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 4. GET /api/usage/admin ============
export const getAdminUsage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (req.user.role !== 'platform_admin') {
    throw new AppError('Platform admin access required', 403);
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalQueriesAgg,
    monthlyAgg,
    newUsersCount,
    last30DaysLogs,
    topOrgs,
    topPersonalUsers,
  ] = await Promise.all([
    // Total queries all time
    prisma.usageLog.aggregate({
      _count: { id: true },
      _sum: { providerCost: true, customerPrice: true },
    }),
    // This month's aggregates
    prisma.usageLog.aggregate({
      where: { createdAt: { gte: monthStart } },
      _count: { id: true },
      _sum: { providerCost: true, customerPrice: true },
    }),
    // New users this month
    prisma.user.count({
      where: { createdAt: { gte: monthStart } },
    }),
    // Last 30 days logs for daily chart + provider breakdown
    prisma.usageLog.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: {
        providerCost: true,
        customerPrice: true,
        createdAt: true,
        model: { select: { provider: true } },
        organizationId: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    // Top orgs by spend (real orgs only, exclude "Personal")
    prisma.usageLog.groupBy({
      by: ['organizationId'],
      where: { organizationId: { not: null } },
      _sum: { customerPrice: true },
      _count: true,
      orderBy: { _sum: { customerPrice: 'desc' } },
      take: 20, // fetch more, filter after name lookup
    }),
    // Top personal users by spend
    prisma.usageLog.groupBy({
      by: ['userId'],
      _sum: { customerPrice: true },
      _count: true,
      orderBy: { _sum: { customerPrice: 'desc' } },
      take: 20,
    }),
  ]);

  // Fetch org names for top orgs
  const orgIds = topOrgs
    .map((o) => o.organizationId)
    .filter((id): id is string => id !== null);

  const orgs = orgIds.length > 0
    ? await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      })
    : [];

  const orgNameMap = new Map(orgs.map((o) => [o.id, o.name]));

  // Separate real organizations from "Personal" ones
  const realOrgsList: Array<{ organizationId: string; name: string; totalQueries: number; totalSpend: number }> = [];
  const personalOrgIds = new Set<string>();

  for (const o of topOrgs) {
    const name = orgNameMap.get(o.organizationId!) || 'Unknown';
    if (name.toLowerCase() === 'personal' || name === 'Unknown') {
      if (o.organizationId) personalOrgIds.add(o.organizationId);
    } else {
      realOrgsList.push({
        organizationId: o.organizationId!,
        name,
        totalQueries: o._count,
        totalSpend: parseFloat((o._sum?.customerPrice || 0).toFixed(4)),
      });
    }
  }

  // Fetch user details for top personal users
  const personalUserIds = topPersonalUsers.map((u: { userId: string }) => u.userId);
  const personalUsers = personalUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: personalUserIds } },
        select: { id: true, name: true, email: true, organizationId: true },
      })
    : [];

  const userMap = new Map(personalUsers.map((u) => [u.id, u]));

  // Build personal users list (users in "Personal" orgs or without org)
  const personalUsersList = topPersonalUsers
    .map((u: { userId: string; _count: number; _sum: { customerPrice: number | null } }) => {
      const user = userMap.get(u.userId);
      if (!user) return null;
      // Only include if user is in a "Personal" org or has no org
      const isPersonal = !user.organizationId || personalOrgIds.has(user.organizationId);
      if (!isPersonal) return null;
      return {
        userId: u.userId,
        name: user.name || user.email,
        email: user.email,
        totalQueries: u._count,
        totalSpend: parseFloat((u._sum?.customerPrice || 0).toFixed(4)),
      };
    })
    .filter((u: unknown): u is { userId: string; name: string; email: string; totalQueries: number; totalSpend: number } => u !== null)
    .slice(0, 10);

  // Also build a combined topOrgs for backward compatibility
  const topOrgsList = [
    ...realOrgsList.slice(0, 10),
    ...personalUsersList.map((u: { userId: string; name: string; totalQueries: number; totalSpend: number }) => ({
      organizationId: u.userId,
      name: u.name,
      totalQueries: u.totalQueries,
      totalSpend: u.totalSpend,
    })),
  ].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 10);

  // Revenue by provider
  const providerRevenue = new Map<string, { providerCost: number; customerPrice: number }>();
  // Daily revenue chart
  const dailyMap = new Map<string, { revenue: number; providerCost: number; queries: number }>();

  for (const l of last30DaysLogs) {
    // Provider revenue
    const pr = providerRevenue.get(l.model.provider);
    if (pr) {
      pr.providerCost += l.providerCost;
      pr.customerPrice += l.customerPrice;
    } else {
      providerRevenue.set(l.model.provider, {
        providerCost: l.providerCost,
        customerPrice: l.customerPrice,
      });
    }

    // Daily
    const dateKey = l.createdAt.toISOString().split('T')[0];
    const dc = dailyMap.get(dateKey);
    if (dc) {
      dc.revenue += l.customerPrice;
      dc.providerCost += l.providerCost;
      dc.queries += 1;
    } else {
      dailyMap.set(dateKey, {
        revenue: l.customerPrice,
        providerCost: l.providerCost,
        queries: 1,
      });
    }
  }

  const revenueByProvider = Object.fromEntries(
    Array.from(providerRevenue.entries()).map(([provider, data]) => [
      provider,
      {
        providerCost: parseFloat(data.providerCost.toFixed(4)),
        customerRevenue: parseFloat(data.customerPrice.toFixed(4)),
        margin: parseFloat((data.customerPrice - data.providerCost).toFixed(4)),
      },
    ])
  );

  // Fill daily chart
  const dailyRevenue: Array<{ date: string; revenue: number; providerCost: number; margin: number; queries: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const entry = dailyMap.get(key);
    const rev = entry?.revenue || 0;
    const cost = entry?.providerCost || 0;
    dailyRevenue.push({
      date: key,
      revenue: parseFloat(rev.toFixed(4)),
      providerCost: parseFloat(cost.toFixed(4)),
      margin: parseFloat((rev - cost).toFixed(4)),
      queries: entry?.queries || 0,
    });
  }

  const totalProviderCost = totalQueriesAgg._sum.providerCost || 0;
  const totalCustomerRevenue = totalQueriesAgg._sum.customerPrice || 0;

  res.json({
    success: true,
    statusCode: 200,
    message: 'Platform admin usage stats retrieved',
    data: {
      allTime: {
        totalQueries: totalQueriesAgg._count.id,
        totalProviderCost: parseFloat(totalProviderCost.toFixed(4)),
        totalCustomerRevenue: parseFloat(totalCustomerRevenue.toFixed(4)),
        totalMargin: parseFloat((totalCustomerRevenue - totalProviderCost).toFixed(4)),
      },
      thisMonth: {
        totalQueries: monthlyAgg._count.id,
        providerCost: parseFloat((monthlyAgg._sum.providerCost || 0).toFixed(4)),
        customerRevenue: parseFloat((monthlyAgg._sum.customerPrice || 0).toFixed(4)),
        margin: parseFloat(
          ((monthlyAgg._sum.customerPrice || 0) - (monthlyAgg._sum.providerCost || 0)).toFixed(4)
        ),
        newUsers: newUsersCount,
      },
      revenueByProvider,
      topOrgs: topOrgsList,
      topOrganizations: realOrgsList.slice(0, 10),
      topPersonalUsers: personalUsersList,
      dailyRevenue,
    },
    timestamp: new Date().toISOString(),
  });
});
