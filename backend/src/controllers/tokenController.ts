import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { isValidUUID } from '../utils/validators.js';
import { createNotification } from '../utils/notify.js';

// ============ 1. POST /api/tokens/allocate ============
export const allocateTokens = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { assignedToId, tokensAllocated, periodStart, periodEnd, notes } = req.body;

  if (!assignedToId || !isValidUUID(assignedToId)) {
    throw new AppError('Valid assignedToId is required', 400);
  }
  if (!tokensAllocated || tokensAllocated <= 0) {
    throw new AppError('tokensAllocated must be greater than 0', 400);
  }
  if (!periodStart || !periodEnd) {
    throw new AppError('periodStart and periodEnd are required', 400);
  }
  if (new Date(periodEnd) <= new Date(periodStart)) {
    throw new AppError('periodEnd must be after periodStart', 400);
  }

  const assigner = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, name: true, role: true, organizationId: true },
  });
  if (!assigner || !assigner.organizationId) {
    throw new AppError('You must belong to an organization', 400);
  }

  // Verify target user
  const target = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true, organizationId: true, managerId: true, role: true },
  });
  if (!target) throw new AppError('Target user not found', 404);

  // Authorization: must be same org
  if (target.organizationId !== assigner.organizationId) {
    throw new AppError('Can only allocate tokens to users in your organization', 403);
  }

  // Role checks
  if (assigner.role === 'manager') {
    // Manager can only assign to their direct employees
    if (target.managerId !== assigner.id) {
      throw new AppError('Managers can only allocate tokens to their direct employees', 403);
    }
  } else if (assigner.role !== 'org_owner' && assigner.role !== 'platform_admin') {
    throw new AppError('Only org owners and managers can allocate tokens', 403);
  }

  // Check token pool availability
  const pool = await prisma.tokenPool.findUnique({
    where: { organizationId: assigner.organizationId },
  });

  if (!pool) {
    throw new AppError('No token pool configured for this organization', 400);
  }
  if (pool.availableTokens < tokensAllocated) {
    throw new AppError(
      `Insufficient tokens in pool. Available: ${pool.availableTokens}, Requested: ${tokensAllocated}`,
      400
    );
  }

  // Create allocation and update pool in a transaction
  const [allocation] = await prisma.$transaction([
    prisma.tokenAllocation.create({
      data: {
        assignedById: assigner.id,
        assignedToId,
        organizationId: assigner.organizationId,
        tokensAllocated,
        tokensRemaining: tokensAllocated,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        notes: notes ?? null,
      },
    }),
    prisma.tokenPool.update({
      where: { organizationId: assigner.organizationId },
      data: {
        allocatedTokens: { increment: tokensAllocated },
        availableTokens: { decrement: tokensAllocated },
      },
    }),
  ]);

  // Notify recipient
  await createNotification(
    assignedToId,
    'token_assigned',
    'Tokens allocated to you',
    `${tokensAllocated.toLocaleString()} tokens allocated to you by ${assigner.name}`,
    allocation.id,
    'token_allocation'
  );

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Tokens allocated successfully',
    data: allocation,
    timestamp: new Date().toISOString(),
  });
});

// ============ 2. GET /api/tokens/my-allocation ============
export const getMyAllocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const now = new Date();

  const [activeAllocations, pastAllocations] = await Promise.all([
    prisma.tokenAllocation.findMany({
      where: {
        assignedToId: req.user.userId,
        status: 'active',
        periodEnd: { gte: now },
      },
      include: {
        assignedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { periodEnd: 'asc' },
    }),
    prisma.tokenAllocation.findMany({
      where: {
        assignedToId: req.user.userId,
        OR: [
          { status: { not: 'active' } },
          { periodEnd: { lt: now } },
        ],
      },
      include: {
        assignedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  const totalAllocated = activeAllocations.reduce((s, a) => s + a.tokensAllocated, 0);
  const totalUsed = activeAllocations.reduce((s, a) => s + a.tokensUsed, 0);
  const totalRemaining = activeAllocations.reduce((s, a) => s + a.tokensRemaining, 0);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Token allocation retrieved',
    data: {
      summary: {
        totalAllocated,
        totalUsed,
        totalRemaining,
        usagePercent: totalAllocated > 0 ? parseFloat(((totalUsed / totalAllocated) * 100).toFixed(2)) : 0,
      },
      activeAllocations,
      pastAllocations,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 3. GET /api/tokens/pool ============
export const getTokenPool = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!['org_owner', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Only org owners can view the token pool', 403);
  }
  if (!req.user.organizationId) {
    throw new AppError('You must belong to an organization', 400);
  }

  const pool = await prisma.tokenPool.findUnique({
    where: { organizationId: req.user.organizationId },
  });

  if (!pool) {
    res.json({
      success: true,
      statusCode: 200,
      message: 'No token pool configured',
      data: null,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Get breakdown by manager
  const managers = await prisma.user.findMany({
    where: { organizationId: req.user.organizationId, role: 'manager' },
    select: { id: true, name: true, email: true },
  });

  const managerBreakdown = await Promise.all(
    managers.map(async (mgr) => {
      const allocations = await prisma.tokenAllocation.findMany({
        where: { assignedToId: mgr.id, organizationId: req.user!.organizationId!, status: 'active' },
      });
      const totalAllocated = allocations.reduce((s, a) => s + a.tokensAllocated, 0);
      const totalUsed = allocations.reduce((s, a) => s + a.tokensUsed, 0);

      // What this manager has given to their employees
      const givenAllocations = await prisma.tokenAllocation.findMany({
        where: { assignedById: mgr.id, status: 'active' },
      });
      const givenTotal = givenAllocations.reduce((s, a) => s + a.tokensAllocated, 0);
      const givenUsed = givenAllocations.reduce((s, a) => s + a.tokensUsed, 0);

      return {
        manager: mgr,
        receivedFromOwner: { allocated: totalAllocated, used: totalUsed },
        distributedToTeam: { allocated: givenTotal, used: givenUsed },
      };
    })
  );

  res.json({
    success: true,
    statusCode: 200,
    message: 'Token pool retrieved',
    data: {
      pool,
      managerBreakdown,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 4. GET /api/tokens/team ============
export const getTeamTokens = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!['manager', 'org_owner', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Insufficient permissions', 403);
  }

  // Manager's own allocation from owner
  const myAllocations = await prisma.tokenAllocation.findMany({
    where: { assignedToId: req.user.userId, status: 'active' },
  });
  const myTotal = myAllocations.reduce((s, a) => s + a.tokensAllocated, 0);
  const myUsed = myAllocations.reduce((s, a) => s + a.tokensUsed, 0);

  // What manager gave to each employee
  const givenAllocations = await prisma.tokenAllocation.findMany({
    where: { assignedById: req.user.userId, status: 'active' },
    include: {
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  const employeeBreakdown = givenAllocations.map((a) => ({
    employee: a.assignedTo,
    tokensAllocated: a.tokensAllocated,
    tokensUsed: a.tokensUsed,
    tokensRemaining: a.tokensRemaining,
    usagePercent: a.tokensAllocated > 0
      ? parseFloat(((a.tokensUsed / a.tokensAllocated) * 100).toFixed(2))
      : 0,
    periodStart: a.periodStart,
    periodEnd: a.periodEnd,
    allocationId: a.id,
  }));

  const totalGiven = givenAllocations.reduce((s, a) => s + a.tokensAllocated, 0);
  const totalTeamUsed = givenAllocations.reduce((s, a) => s + a.tokensUsed, 0);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Team token usage retrieved',
    data: {
      myAllocation: {
        totalAllocated: myTotal,
        totalUsed: myUsed,
        totalRemaining: myTotal - myUsed,
      },
      teamDistribution: {
        totalGiven,
        totalTeamUsed,
        remainingToAllocate: myTotal - totalGiven,
      },
      employees: employeeBreakdown,
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 5. PUT /api/tokens/allocate/:id ============
export const updateAllocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid allocation ID', 400);

  const { tokensAllocated } = req.body;
  if (!tokensAllocated || tokensAllocated <= 0) {
    throw new AppError('tokensAllocated must be greater than 0', 400);
  }

  const allocation = await prisma.tokenAllocation.findUnique({ where: { id } });
  if (!allocation) throw new AppError('Allocation not found', 404);
  if (allocation.assignedById !== req.user.userId && req.user.role !== 'platform_admin') {
    throw new AppError('Only the assigner can modify this allocation', 403);
  }
  if (allocation.status !== 'active') {
    throw new AppError('Cannot modify a non-active allocation', 400);
  }
  if (new Date() > allocation.periodEnd) {
    throw new AppError('Cannot modify an expired allocation', 400);
  }

  const diff = tokensAllocated - allocation.tokensAllocated;

  if (diff > 0) {
    // Increasing — check pool
    const pool = await prisma.tokenPool.findUnique({
      where: { organizationId: allocation.organizationId },
    });
    if (!pool || pool.availableTokens < diff) {
      throw new AppError(`Insufficient tokens in pool. Available: ${pool?.availableTokens ?? 0}`, 400);
    }
  }

  const newRemaining = allocation.tokensRemaining + diff;
  if (newRemaining < 0) {
    throw new AppError('Cannot reduce below already-used tokens', 400);
  }

  const [updated] = await prisma.$transaction([
    prisma.tokenAllocation.update({
      where: { id },
      data: {
        tokensAllocated,
        tokensRemaining: newRemaining,
      },
    }),
    prisma.tokenPool.update({
      where: { organizationId: allocation.organizationId },
      data: {
        allocatedTokens: { increment: diff },
        availableTokens: { decrement: diff },
      },
    }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Allocation updated successfully',
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

// ============ 6. DELETE /api/tokens/allocate/:id ============
export const revokeAllocation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid allocation ID', 400);

  const allocation = await prisma.tokenAllocation.findUnique({ where: { id } });
  if (!allocation) throw new AppError('Allocation not found', 404);
  if (allocation.assignedById !== req.user.userId && req.user.role !== 'platform_admin') {
    throw new AppError('Only the assigner can revoke this allocation', 403);
  }
  if (allocation.status !== 'active') {
    throw new AppError('Allocation is already revoked or expired', 400);
  }

  // Return unused tokens to pool
  const tokensToReturn = allocation.tokensRemaining;

  const tokensUsed = allocation.tokensAllocated - tokensToReturn;

  const [updated] = await prisma.$transaction([
    prisma.tokenAllocation.update({
      where: { id },
      data: { status: 'revoked' },
    }),
    prisma.tokenPool.update({
      where: { organizationId: allocation.organizationId },
      data: {
        allocatedTokens: { decrement: allocation.tokensAllocated },
        availableTokens: { increment: tokensToReturn },
        usedTokens: { increment: tokensUsed },
      },
    }),
  ]);

  await createNotification(
    allocation.assignedToId,
    'token_assigned',
    'Token allocation revoked',
    `Your token allocation of ${allocation.tokensAllocated.toLocaleString()} tokens has been revoked`,
    allocation.id,
    'token_allocation'
  );

  res.json({
    success: true,
    statusCode: 200,
    message: 'Allocation revoked, tokens returned to pool',
    data: updated,
    timestamp: new Date().toISOString(),
  });
});
