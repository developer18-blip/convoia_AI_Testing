import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import prisma from '../config/db.js';

// ─── Get activity feed (role-scoped) ─────────────────────────────────────────
export const getActivityFeed = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    if (!user?.organizationId) {
      throw new AppError('Not part of an organization', 400);
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const skip = (page - 1) * limit;
    const action = req.query.action as string | undefined;

    // Build where clause based on role
    const where: any = { organizationId: user.organizationId };

    if (action) {
      where.action = action;
    }

    // Managers see only their own actions + actions targeting their direct reports
    if (user.role === 'manager') {
      const directReports = await prisma.user.findMany({
        where: { managerId: user.id },
        select: { id: true },
      });
      const reportIds = directReports.map(r => r.id);

      where.OR = [
        { actorId: user.id },
        { targetId: { in: reportIds } },
        { actorId: { in: reportIds } },
      ];
    }

    // Employees see only their own activity
    if (user.role === 'employee') {
      where.OR = [
        { actorId: user.id },
        { targetId: user.id },
      ];
    }

    const [activities, total] = await Promise.all([
      (prisma as any).activityLog.findMany({
        where,
        include: {
          actor: { select: { id: true, name: true, email: true, role: true, avatar: true } },
          target: { select: { id: true, name: true, email: true, role: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      (prisma as any).activityLog.count({ where }),
    ]);

    res.json({
      success: true,
      statusCode: 200,
      data: {
        activities,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Get activity for a specific user ────────────────────────────────────────
export const getUserActivity = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { userId } = req.params;
    const requester = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    if (!requester?.organizationId) throw new AppError('Not part of an organization', 400);

    // Permission check
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.organizationId !== requester.organizationId) {
      throw new AppError('User not found in your organization', 404);
    }

    // Managers can only view their direct reports
    if (requester.role === 'manager' && target.managerId !== requester.id && target.id !== requester.id) {
      throw new AppError('You can only view activity of your direct reports', 403);
    }

    // Employees can only view themselves
    if (requester.role === 'employee' && target.id !== requester.id) {
      throw new AppError('You can only view your own activity', 403);
    }

    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const activities = await (prisma as any).activityLog.findMany({
      where: {
        organizationId: requester.organizationId,
        OR: [{ actorId: userId }, { targetId: userId }],
      },
      include: {
        actor: { select: { id: true, name: true, role: true } },
        target: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      statusCode: 200,
      data: activities,
      timestamp: new Date().toISOString(),
    });
  }
);
