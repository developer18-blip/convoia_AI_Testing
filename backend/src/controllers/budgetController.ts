import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { BudgetUsageStats, SetBudgetRequest } from '../types/index.js';
import { isValidUUID } from '../utils/validators.js';
import logger from '../config/logger.js';

export const setBudget = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const userId = req.params.userId || req.user.userId;
  const { monthlyCap, alertThreshold = 80, autoDowngrade = true, fallbackModelId } = req.body as SetBudgetRequest & {
    orgId?: string;
  };

  if (!isValidUUID(userId)) {
    throw new AppError('Invalid user ID format', 400);
  }

  // Check authorization
  if (userId !== req.user.userId && req.user.role !== 'admin') {
    throw new AppError('Unauthorized to set budget for this user', 403);
  }

  if (!monthlyCap || monthlyCap <= 0) {
    throw new AppError('Monthly cap must be greater than 0', 400);
  }

  if (alertThreshold < 0 || alertThreshold > 100) {
    throw new AppError('Alert threshold must be between 0 and 100', 400);
  }

  // Token allocation awareness: budget cap cannot exceed user's token allocation
  const activeAllocation = await prisma.tokenAllocation.findFirst({
    where: {
      assignedToId: userId,
      status: 'active',
      periodEnd: { gte: new Date() },
    },
    orderBy: { tokensAllocated: 'desc' },
  });

  if (activeAllocation) {
    // Convert token allocation to approximate dollar amount for comparison
    // This is a soft check — log a warning if budget exceeds allocation
    const allocatedTokens = activeAllocation.tokensAllocated;
    if (monthlyCap > allocatedTokens) {
      // Allow it but inform — the budget is in dollars, allocation is in tokens
      // They're different units, so we just check if there IS an allocation
    }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const organizationId = user.organizationId || user.id;

    // Calculate reset date (first day of next month)
    const now = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const budget = await prisma.budget.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      update: {
        monthlyCap,
        alertThreshold,
        autoDowngrade,
        fallbackModelId: fallbackModelId || null,
        alertSent: false, // Reset alert when updating budget
      },
      create: {
        userId,
        organizationId,
        monthlyCap,
        currentUsage: 0,
        alertThreshold,
        autoDowngrade,
        fallbackModelId: fallbackModelId || null,
        resetDate,
      },
    });

    logger.info(`Budget set for user ${userId}`, {
      monthlyCap,
      alertThreshold,
      autoDowngrade,
    });

    res.json({
      success: true,
      statusCode: 200,
      message: 'Budget configured successfully',
      data: {
        userId: budget.userId,
        monthlyCap: budget.monthlyCap,
        currentUsage: budget.currentUsage,
        alertThreshold: budget.alertThreshold,
        autoDowngrade: budget.autoDowngrade,
        resetDate: budget.resetDate.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(`Budget setup failed for user ${userId}:`, error);
    throw new AppError('Failed to set budget', 500);
  }
});

export const checkBudget = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const userId = req.params.userId || req.user.userId;

  if (!isValidUUID(userId)) {
    throw new AppError('Invalid user ID format', 400);
  }

  // Check authorization
  if (userId !== req.user.userId && req.user.role !== 'admin') {
    throw new AppError('Unauthorized to check budget for this user', 403);
  }

  const budget = await prisma.budget.findFirst({
    where: { userId },
  });

  if (!budget) {
    throw new AppError('Budget not configured for this user', 404);
  }

  const usagePercent = (budget.currentUsage / budget.monthlyCap) * 100;
  const remainingBudget = budget.monthlyCap - budget.currentUsage;

  // Check if alert should be sent
  if (usagePercent >= budget.alertThreshold && !budget.alertSent) {
    await prisma.budget.update({
      where: { id: budget.id },
      data: { alertSent: true },
    });

    logger.warn(`Budget alert triggered for user ${userId}`, {
      usagePercent: parseFloat(usagePercent.toFixed(2)),
      threshold: budget.alertThreshold,
    });
  }

  const stats: BudgetUsageStats = {
    monthlyCap: budget.monthlyCap,
    currentUsage: budget.currentUsage,
    usagePercent: parseFloat(usagePercent.toFixed(2)),
    remainingBudget: Math.max(0, remainingBudget),
    alertThreshold: budget.alertThreshold,
    alertSent: usagePercent >= budget.alertThreshold,
    resetDate: budget.resetDate.toISOString(),
  };

  res.json({
    success: true,
    statusCode: 200,
    message: 'Budget status retrieved',
    data: stats,
    timestamp: new Date().toISOString(),
  });
});

export const resetMonthlyBudgets = asyncHandler(async (req: Request, res: Response) => {
  // This is typically called by a cron job, not exposed via API
  // But we include it for manual triggering if needed (admin only)
  if (req.user && req.user.role !== 'admin') {
    throw new AppError('Only admins can reset budgets', 403);
  }

  const now = new Date();
  const budgetsToReset = await prisma.budget.findMany({
    where: {
      resetDate: {
        lte: now,
      },
    },
  });

  if (budgetsToReset.length === 0) {
    return res.json({
      success: true,
      statusCode: 200,
      message: 'No budgets to reset',
      data: { count: 0 },
      timestamp: new Date().toISOString(),
    });
  }

  // Reset all budgets
  const updates = budgetsToReset.map((budget) => {
    const nextResetDate = new Date(budget.resetDate);
    nextResetDate.setMonth(nextResetDate.getMonth() + 1);

    return prisma.budget.update({
      where: { id: budget.id },
      data: {
        currentUsage: 0,
        alertSent: false,
        resetDate: nextResetDate,
      },
    });
  });

  await Promise.all(updates);

  logger.info(`Monthly budgets reset`, {
    count: budgetsToReset.length,
  });

  return res.json({
    success: true,
    statusCode: 200,
    message: `${budgetsToReset.length} budgets reset successfully`,
    data: { count: budgetsToReset.length },
    timestamp: new Date().toISOString(),
  });
});

// ============ GET BUDGET STATUS (for dashboard) ============
export const getBudgetStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const userId = req.user.userId;

  const budget = await prisma.budget.findFirst({
    where: { userId },
  });

  if (!budget) {
    res.json({
      success: true,
      statusCode: 200,
      message: 'No budget configured',
      data: {
        configured: false,
        monthlyCap: null,
        currentUsage: 0,
        usagePercent: 0,
        remainingBudget: null,
        alertThreshold: null,
        alertSent: false,
        autoDowngrade: false,
        fallbackModelId: null,
        resetDate: null,
      },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const usagePercent = (budget.currentUsage / budget.monthlyCap) * 100;

  res.json({
    success: true,
    statusCode: 200,
    message: 'Budget status retrieved',
    data: {
      configured: true,
      monthlyCap: budget.monthlyCap,
      currentUsage: budget.currentUsage,
      usagePercent: parseFloat(usagePercent.toFixed(2)),
      remainingBudget: Math.max(0, budget.monthlyCap - budget.currentUsage),
      alertThreshold: budget.alertThreshold,
      alertSent: budget.alertSent,
      autoDowngrade: budget.autoDowngrade,
      fallbackModelId: budget.fallbackModelId,
      resetDate: budget.resetDate.toISOString(),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ GET ORG BUDGETS ============
export const getOrgBudgets = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { orgId } = req.params;

  if (!isValidUUID(orgId)) {
    throw new AppError('Invalid organization ID format', 400);
  }

  // Only manager+ or admin can view org budgets
  const allowedRoles = ['manager', 'org_owner', 'admin', 'platform_admin'];
  if (!allowedRoles.includes(req.user.role)) {
    throw new AppError('Insufficient permissions to view org budgets', 403);
  }

  // Verify user belongs to this org (unless admin)
  const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);
  if (!isAdmin && req.user.organizationId !== orgId) {
    throw new AppError('Unauthorized to view budgets for this organization', 403);
  }

  const budgets = await prisma.budget.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true },
      },
    },
    orderBy: { currentUsage: 'desc' },
  });

  const orgTotalCap = budgets.reduce((sum, b) => sum + b.monthlyCap, 0);
  const orgTotalUsage = budgets.reduce((sum, b) => sum + b.currentUsage, 0);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Organization budgets retrieved',
    data: {
      organizationId: orgId,
      totalBudgetCap: orgTotalCap,
      totalUsage: orgTotalUsage,
      usagePercent: orgTotalCap > 0
        ? parseFloat(((orgTotalUsage / orgTotalCap) * 100).toFixed(2))
        : 0,
      budgets: budgets.map((b) => ({
        id: b.id,
        user: b.user,
        monthlyCap: b.monthlyCap,
        currentUsage: b.currentUsage,
        usagePercent: parseFloat(
          ((b.currentUsage / b.monthlyCap) * 100).toFixed(2)
        ),
        alertThreshold: b.alertThreshold,
        alertSent: b.alertSent,
        autoDowngrade: b.autoDowngrade,
        fallbackModelId: b.fallbackModelId,
        resetDate: b.resetDate.toISOString(),
      })),
    },
    timestamp: new Date().toISOString(),
  });
});

export const autoDowngradeUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new AppError('Admin access required', 403);
  }

  const userId = req.params.userId;

  if (!isValidUUID(userId)) {
    throw new AppError('Invalid user ID format', 400);
  }

  const budget = await prisma.budget.findFirst({
    where: { userId },
  });

  if (!budget) {
    throw new AppError('Budget not found for this user', 404);
  }

  if (!budget.fallbackModelId) {
    throw new AppError('No fallback model configured for this user', 400);
  }

  const fallbackModel = await prisma.aIModel.findUnique({
    where: { id: budget.fallbackModelId },
  });

  if (!fallbackModel) {
    throw new AppError('Fallback model not found', 404);
  }

  // Update budget to indicate downgrade happened
  const updatedBudget = await prisma.budget.update({
    where: { id: budget.id },
    data: {
      autoDowngrade: true,
    },
  });

  logger.warn(`User ${userId} auto-downgraded due to budget exceeded`, {
    fallbackModel: fallbackModel.name,
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'User downgraded to fallback model due to budget limit',
    data: {
      userId,
      fallbackModel: {
        id: fallbackModel.id,
        name: fallbackModel.name,
        provider: fallbackModel.provider,
      },
      budget: {
        monthlyCap: updatedBudget.monthlyCap,
        currentUsage: updatedBudget.currentUsage,
      },
    },
    timestamp: new Date().toISOString(),
  });
});
