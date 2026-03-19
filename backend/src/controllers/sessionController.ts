import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { HourlySessionRequest, HourlySessionResponse, SessionAccessCheck } from '../types/index.js';
import { isValidUUID } from '../utils/validators.js';
import logger from '../config/logger.js';

export const createHourlySession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const userId = req.params.userId || req.user.userId;
  const { modelId, durationHours, amountPaid } = req.body as HourlySessionRequest;

  if (!isValidUUID(userId)) {
    throw new AppError('Invalid user ID format', 400);
  }

  // Check authorization
  if (userId !== req.user.userId && req.user.role !== 'admin') {
    throw new AppError('Unauthorized to create session for this user', 403);
  }

  if (!isValidUUID(modelId)) {
    throw new AppError('Invalid model ID format', 400);
  }

  if (![1, 3, 6, 24].includes(durationHours)) {
    throw new AppError('Duration must be 1, 3, 6, or 24 hours', 400);
  }

  if (!amountPaid || amountPaid <= 0) {
    throw new AppError('Amount paid must be greater than 0', 400);
  }

  try {
    // Verify model exists
    const model = await prisma.aIModel.findUnique({
      where: { id: modelId },
    });

    if (!model) {
      throw new AppError('AI Model not found', 404);
    }

    // Verify wallet has sufficient balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new AppError('Wallet not found for user', 404);
    }

    if (wallet.balance < amountPaid) {
      throw new AppError('Insufficient wallet balance for this session', 402);
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    // Use prisma transaction for atomicity — all or nothing
    const session = await prisma.$transaction(async (tx) => {
      // 1. Create the session
      const newSession = await tx.hourlySession.create({
        data: {
          userId,
          modelId,
          durationHours,
          amountPaid,
          startTime: now,
          endTime,
          isActive: true,
        },
      });

      // 2. Deduct from wallet
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: amountPaid },
          totalSpent: { increment: amountPaid },
        },
      });

      // 3. Create wallet transaction
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: amountPaid,
          type: 'debit',
          description: `Hourly session: ${model.name} (${durationHours}h)`,
          reference: newSession.id,
        },
      });

      // 4. Create billing record
      const user = await tx.user.findUnique({ where: { id: userId } });
      await tx.billingRecord.create({
        data: {
          userId,
          organizationId: user?.organizationId || userId,
          amount: amountPaid,
          type: 'hourly_session',
          description: `${durationHours}-hour session for ${model.name}`,
          status: 'completed',
        },
      });

      return newSession;
    });

    logger.info(`Hourly session created for user ${userId}`, {
      modelId,
      durationHours,
      amountPaid,
    });

    const response: HourlySessionResponse = {
      id: session.id,
      modelId: session.modelId,
      durationHours: session.durationHours,
      amountPaid: session.amountPaid,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime.toISOString(),
      isActive: session.isActive,
      timeRemainingMinutes: durationHours * 60,
    };

    res.json({
      success: true,
      statusCode: 201,
      message: 'Hourly session created successfully',
      data: response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    logger.error(`Failed to create hourly session for user ${userId}:`, error);
    throw new AppError('Failed to create hourly session', 500);
  }
});

export const getActiveSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const userId = req.params.userId || req.user.userId;
  const modelId = req.params.modelId || req.query.modelId as string;

  if (!isValidUUID(userId)) {
    throw new AppError('Invalid user ID format', 400);
  }

  if (!isValidUUID(modelId)) {
    throw new AppError('Invalid model ID format', 400);
  }

  // Check authorization
  if (userId !== req.user.userId && req.user.role !== 'admin') {
    throw new AppError('Unauthorized to check session for this user', 403);
  }

  const now = new Date();
  const session = await prisma.hourlySession.findFirst({
    where: {
      userId,
      modelId,
      isActive: true,
      endTime: {
        gt: now,
      },
    },
  });

  if (!session) {
    const response: SessionAccessCheck = {
      valid: false,
      session: null,
    };

    return res.json({
      success: true,
      statusCode: 200,
      message: 'No active session found',
      data: response,
      timestamp: new Date().toISOString(),
    });
  }

  const timeRemainingMs = session.endTime.getTime() - now.getTime();
  const timeRemainingMinutes = Math.ceil(timeRemainingMs / (1000 * 60));

  const sessionResponse: HourlySessionResponse = {
    id: session.id,
    modelId: session.modelId,
    durationHours: session.durationHours,
    amountPaid: session.amountPaid,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime.toISOString(),
    isActive: session.isActive,
    timeRemainingMinutes: Math.max(0, timeRemainingMinutes),
  };

  const response: SessionAccessCheck = {
    valid: true,
    session: sessionResponse,
  };

  return res.json({
    success: true,
    statusCode: 200,
    message: 'Active session found',
    data: response,
    timestamp: new Date().toISOString(),
  });
});

export const expireOldSessions = asyncHandler(async (req: Request, res: Response) => {
  // This is typically called by a cron job
  // But we include it for manual triggering if needed (admin only)
  if (req.user && req.user.role !== 'admin') {
    throw new AppError('Only admins can expire sessions', 403);
  }

  const now = new Date();
  const sessionsToExpire = await prisma.hourlySession.findMany({
    where: {
      endTime: {
        lte: now,
      },
      isActive: true,
    },
  });

  if (sessionsToExpire.length === 0) {
    return res.json({
      success: true,
      statusCode: 200,
      message: 'No sessions to expire',
      data: { count: 0 },
      timestamp: new Date().toISOString(),
    });
  }

  // Expire all sessions
  const updates = sessionsToExpire.map((session) =>
    prisma.hourlySession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        isExpired: true,
      },
    })
  );

  await Promise.all(updates);

  logger.info(`Hourly sessions expired`, {
    count: sessionsToExpire.length,
  });

  return res.json({
    success: true,
    statusCode: 200,
    message: `${sessionsToExpire.length} sessions expired successfully`,
    data: { count: sessionsToExpire.length },
    timestamp: new Date().toISOString(),
  });
});

// ============ GET ALL ACTIVE SESSIONS ============
export const getAllActiveSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const userId = req.user.userId;
  const now = new Date();

  const sessions = await prisma.hourlySession.findMany({
    where: {
      userId,
      isActive: true,
      endTime: { gt: now },
    },
    include: {
      model: {
        select: { id: true, name: true, provider: true },
      },
    },
    orderBy: { endTime: 'asc' },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: `${sessions.length} active session(s) found`,
    data: sessions.map((s) => ({
      id: s.id,
      model: s.model,
      durationHours: s.durationHours,
      amountPaid: s.amountPaid,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      isActive: s.isActive,
      timeRemainingMinutes: Math.max(
        0,
        Math.ceil((s.endTime.getTime() - now.getTime()) / (1000 * 60))
      ),
    })),
    timestamp: new Date().toISOString(),
  });
});

// ============ GET SESSION HISTORY ============
export const getSessionHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const userId = req.user.userId;
  const { page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [sessions, total] = await Promise.all([
    prisma.hourlySession.findMany({
      where: {
        userId,
        OR: [
          { isActive: false },
          { endTime: { lte: new Date() } },
        ],
      },
      include: {
        model: {
          select: { id: true, name: true, provider: true },
        },
      },
      orderBy: { startTime: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.hourlySession.count({
      where: {
        userId,
        OR: [
          { isActive: false },
          { endTime: { lte: new Date() } },
        ],
      },
    }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: `${sessions.length} session(s) in history`,
    data: sessions.map((s) => ({
      id: s.id,
      modelName: s.model.name,
      provider: s.model.provider,
      durationHours: s.durationHours,
      amountPaid: s.amountPaid,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      status: s.isExpired ? 'expired' : 'completed',
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ EXPIRE A SPECIFIC SESSION (admin) ============
export const expireSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { sessionId } = req.params;

  if (!isValidUUID(sessionId)) {
    throw new AppError('Invalid session ID format', 400);
  }

  const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);
  if (!isAdmin) {
    throw new AppError('Only admins can manually expire sessions', 403);
  }

  const session = await prisma.hourlySession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new AppError('Session not found', 404);
  }

  if (!session.isActive) {
    throw new AppError('Session is already inactive', 400);
  }

  await prisma.hourlySession.update({
    where: { id: sessionId },
    data: { isActive: false, isExpired: true },
  });

  logger.info(`Session manually expired: sessionId=${sessionId} by admin=${req.user.userId}`);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Session expired successfully',
    data: { sessionId },
    timestamp: new Date().toISOString(),
  });
});

export const validateSessionAccess = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const userId = req.user.userId;
  const modelId = req.params.modelId || (req.query.modelId as string);

  if (!modelId || !isValidUUID(modelId)) {
    throw new AppError('Invalid model ID provided', 400);
  }

  const now = new Date();
  const session = await prisma.hourlySession.findFirst({
    where: {
      userId,
      modelId,
      isActive: true,
      endTime: {
        gt: now,
      },
    },
  });

  const response: SessionAccessCheck = {
    valid: !!session,
    session: session
      ? {
          id: session.id,
          modelId: session.modelId,
          durationHours: session.durationHours,
          amountPaid: session.amountPaid,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
          isActive: session.isActive,
          timeRemainingMinutes: Math.ceil((session.endTime.getTime() - now.getTime()) / (1000 * 60)),
        }
      : null,
  };

  res.json({
    success: true,
    statusCode: 200,
    message: session ? 'Active session found' : 'No active session',
    data: response,
    timestamp: new Date().toISOString(),
  });
});
