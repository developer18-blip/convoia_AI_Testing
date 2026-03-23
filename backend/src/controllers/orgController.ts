import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

// ============ GET /api/org/settings ============
export const getOrgSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!req.user.organizationId) {
    throw new AppError('You do not belong to an organization', 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: req.user.organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      website: true,
      industry: true,
      tier: true,
      status: true,
      monthlyBudget: true,
      createdAt: true,
    },
  });

  if (!org) throw new AppError('Organization not found', 404);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization settings retrieved',
    data: org,
    timestamp: new Date().toISOString(),
  });
});

// ============ PUT /api/org/settings ============
export const updateOrgSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!['org_owner', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Only org owners can update settings', 403);
  }
  if (!req.user.organizationId) {
    throw new AppError('You do not belong to an organization', 400);
  }

  const { name, industry, phone, website, allowEmployeeAvatar } = req.body;

  const updated = await prisma.organization.update({
    where: { id: req.user.organizationId },
    data: {
      ...(name && { name }),
      ...(industry !== undefined && { industry }),
      ...(phone !== undefined && { phone }),
      ...(website !== undefined && { website }),
      ...(allowEmployeeAvatar !== undefined && { allowEmployeeAvatar: Boolean(allowEmployeeAvatar) }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      website: true,
      industry: true,
      tier: true,
      status: true,
      allowEmployeeAvatar: true,
    },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization updated',
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

// ============ GET /api/org/team ============
export const getOrgTeam = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!req.user.organizationId) {
    throw new AppError('You do not belong to an organization', 400);
  }

  // Visibility: managers see their direct reports, org_owner sees all
  let whereClause: any = { organizationId: req.user.organizationId, isActive: true };

  if (req.user.role === 'manager') {
    whereClause = {
      OR: [
        { managerId: req.user.userId },
        { id: req.user.userId },
      ],
      isActive: true,
    };
  } else if (req.user.role === 'employee') {
    // Employees only see themselves
    whereClause = { id: req.user.userId };
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      role: true,
      managerId: true,
      createdAt: true,
    },
    orderBy: { name: 'asc' },
  });

  // Get usage stats for each user from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const userIds = users.map((u) => u.id);

  const usageByUser = await prisma.usageLog.groupBy({
    by: ['userId'],
    where: {
      userId: { in: userIds },
      createdAt: { gte: thirtyDaysAgo },
    },
    _count: { id: true },
    _sum: { customerPrice: true, tokensInput: true, tokensOutput: true },
  });

  const usageMap = new Map(
    usageByUser.map((u) => [
      u.userId,
      {
        queries: u._count.id,
        cost: u._sum.customerPrice ?? 0,
        tokens: (u._sum.tokensInput ?? 0) + (u._sum.tokensOutput ?? 0),
      },
    ])
  );

  // Get budgets
  const budgets = await prisma.budget.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, monthlyCap: true, currentUsage: true },
  });
  const budgetMap = new Map(budgets.map((b) => [b.userId, b]));

  // Get last usage time for each user
  const lastUsage = await prisma.usageLog.findMany({
    where: { userId: { in: userIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['userId'],
    select: { userId: true, createdAt: true },
  });
  const lastActiveMap = new Map(lastUsage.map((l) => [l.userId, l.createdAt.toISOString()]));

  const teamData = users.map((u) => {
    const usage = usageMap.get(u.id);
    const budget = budgetMap.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      role: u.role,
      managerId: u.managerId,
      queries: usage?.queries ?? 0,
      cost: usage?.cost ?? 0,
      tokens: usage?.tokens ?? 0,
      budgetUsed: budget?.currentUsage ?? 0,
      budgetCap: budget?.monthlyCap ?? 0,
      lastActive: lastActiveMap.get(u.id) ?? u.createdAt.toISOString(),
    };
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Team members retrieved',
    data: teamData,
    timestamp: new Date().toISOString(),
  });
});

// ============ GET /api/org/analytics ============
export const getOrgAnalytics = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!['manager', 'org_owner', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Insufficient permissions', 403);
  }
  if (!req.user.organizationId) {
    throw new AppError('You do not belong to an organization', 400);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const orgId = req.user.organizationId;

  const logs = await prisma.usageLog.findMany({
    where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo } },
    select: {
      userId: true,
      customerPrice: true,
      createdAt: true,
      modelId: true,
      model: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Daily usage
  const dailyMap = new Map<string, { date: string; cost: number; queries: number }>();
  const memberMap = new Map<string, { name: string; cost: number; queries: number }>();
  const modelMap = new Map<string, { name: string; cost: number; queries: number }>();

  for (const l of logs) {
    const dateKey = l.createdAt.toISOString().split('T')[0];

    // Daily
    const daily = dailyMap.get(dateKey);
    if (daily) { daily.cost += l.customerPrice; daily.queries += 1; }
    else { dailyMap.set(dateKey, { date: dateKey, cost: l.customerPrice, queries: 1 }); }

    // Member
    const member = memberMap.get(l.userId);
    if (member) { member.cost += l.customerPrice; member.queries += 1; }
    else { memberMap.set(l.userId, { name: l.user.name, cost: l.customerPrice, queries: 1 }); }

    // Model
    const model = modelMap.get(l.modelId);
    if (model) { model.cost += l.customerPrice; model.queries += 1; }
    else { modelMap.set(l.modelId, { name: l.model.name, cost: l.customerPrice, queries: 1 }); }
  }

  // Fill missing days
  const now = new Date();
  const dailyUsage: Array<{ date: string; cost: number; queries: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const entry = dailyMap.get(key);
    dailyUsage.push({
      date: key,
      cost: parseFloat((entry?.cost ?? 0).toFixed(4)),
      queries: entry?.queries ?? 0,
    });
  }

  const memberBreakdown = Array.from(memberMap.values())
    .sort((a, b) => b.cost - a.cost)
    .map((m) => ({ ...m, cost: parseFloat(m.cost.toFixed(4)) }));

  const modelBreakdown = Array.from(modelMap.values())
    .sort((a, b) => b.cost - a.cost)
    .map((m) => ({ ...m, cost: parseFloat(m.cost.toFixed(4)) }));

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization analytics retrieved',
    data: {
      dailyUsage,
      memberBreakdown,
      modelBreakdown,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ GET /api/org/user/:userId ============
export const getUserDetails = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { userId } = req.params;

  // Check visibility
  if (req.user.role === 'employee' && req.user.userId !== userId) {
    throw new AppError("You don't have permission to view this user's data", 403);
  }
  if (req.user.role === 'manager') {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { managerId: true } });
    if (target?.managerId !== req.user.userId && req.user.userId !== userId) {
      throw new AppError("You don't have permission to view this user's data", 403);
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, organizationId: true, createdAt: true,
    },
  });
  if (!user) throw new AppError('User not found', 404);

  // Same org check for org_owner
  if (req.user.role === 'org_owner' && user.organizationId !== req.user.organizationId) {
    throw new AppError("You don't have permission to view this user's data", 403);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [usageAgg, budget, dailyLogs] = await Promise.all([
    prisma.usageLog.aggregate({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
      _sum: { customerPrice: true, tokensInput: true, tokensOutput: true },
    }),
    prisma.budget.findFirst({ where: { userId } }),
    prisma.usageLog.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { customerPrice: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  // Build daily chart
  const dailyMap = new Map<string, number>();
  for (const l of dailyLogs) {
    const key = l.createdAt.toISOString().split('T')[0];
    dailyMap.set(key, (dailyMap.get(key) ?? 0) + l.customerPrice);
  }
  const now = new Date();
  const dailyUsage: Array<{ date: string; cost: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    dailyUsage.push({ date: key, cost: parseFloat((dailyMap.get(key) ?? 0).toFixed(4)) });
  }

  res.json({
    success: true,
    statusCode: 200,
    message: 'User details retrieved',
    data: {
      ...user,
      queries: usageAgg._count.id,
      cost: parseFloat((usageAgg._sum.customerPrice ?? 0).toFixed(4)),
      tokens: (usageAgg._sum.tokensInput ?? 0) + (usageAgg._sum.tokensOutput ?? 0),
      budget: budget ? {
        monthlyCap: budget.monthlyCap,
        currentUsage: budget.currentUsage,
        alertThreshold: budget.alertThreshold,
      } : null,
      dailyUsage,
    },
    timestamp: new Date().toISOString(),
  });
});
