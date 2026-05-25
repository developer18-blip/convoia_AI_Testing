import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { isValidUUID } from '../utils/validators.js';
import { NotificationService } from '../services/notificationService.js';

// ============ 1. GET /api/notifications ============
export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { unreadOnly, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = { userId: req.user.userId };
  if (unreadOnly === 'true') {
    where.isRead = false;
  }

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Notifications retrieved',
    data: {
      notifications,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 2. PATCH /api/notifications/:id/read ============
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid notification ID', 400);

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new AppError('Notification not found', 404);
  if (notification.userId !== req.user.userId) {
    throw new AppError('Not your notification', 403);
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Notification marked as read',
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

// ============ 3. PATCH /api/notifications/read-all ============
export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const result = await prisma.notification.updateMany({
    where: { userId: req.user.userId, isRead: false },
    data: { isRead: true },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: `${result.count} notifications marked as read`,
    data: { count: result.count },
    timestamp: new Date().toISOString(),
  });
});

// ============ 4. GET /api/notifications/count ============
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const unreadCount = await prisma.notification.count({
    where: { userId: req.user.userId, isRead: false },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Unread count retrieved',
    data: { unreadCount },
    timestamp: new Date().toISOString(),
  });
});

// ============ 5. DELETE /api/notifications/:id ============
export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid notification ID', 400);

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw new AppError('Notification not found', 404);
  if (notification.userId !== req.user.userId) {
    throw new AppError('Not your notification', 403);
  }

  await prisma.notification.delete({ where: { id } });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Notification deleted',
    timestamp: new Date().toISOString(),
  });
});

// ============ 6. GET /api/notifications/preferences ============
// Always returns a full defaults object (never null/404). The "no row = all
// true" model is hidden from the client — the backend is the single source of
// truth for "what are my preferences".
export const getPreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const preferences = await NotificationService.getPreferences(req.user.userId);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Notification preferences retrieved',
    data: preferences,
    timestamp: new Date().toISOString(),
  });
});

// ============ 7. PATCH /api/notifications/preferences ============
// Partial update; lazily creates the row on first write. Scoped to req.user.
export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const body = req.body ?? {};
  const allowed = ['emailDigest', 'inAppNotifications', 'memberAlerts'] as const;
  const patch: Partial<Record<(typeof allowed)[number], boolean>> = {};

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'boolean') {
        throw new AppError(`${key} must be a boolean`, 400);
      }
      patch[key] = body[key];
    }
  }

  const preferences = await NotificationService.updatePreferences(req.user.userId, patch);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Notification preferences updated',
    data: preferences,
    timestamp: new Date().toISOString(),
  });
});
