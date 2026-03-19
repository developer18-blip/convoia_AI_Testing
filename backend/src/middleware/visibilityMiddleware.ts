import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { AppError } from './errorHandler.js';

/**
 * Check if requester can view a target user's data.
 * platform_admin → anyone
 * org_owner → users in their org
 * manager → their direct employees only
 * employee → themselves only
 */
export async function canViewUser(requesterId: string, requesterRole: string, requesterOrgId: string | undefined, targetId: string): Promise<boolean> {
  if (requesterRole === 'platform_admin') return true;
  if (requesterId === targetId) return true;

  if (requesterRole === 'org_owner') {
    if (!requesterOrgId) return false;
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { organizationId: true },
    });
    return target?.organizationId === requesterOrgId;
  }

  if (requesterRole === 'manager') {
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { managerId: true },
    });
    return target?.managerId === requesterId;
  }

  return false;
}

/**
 * Middleware factory: enforces visibility for a target user param.
 * Expects req.params to contain the param name (default: 'userId').
 */
export function enforceUserVisibility(paramName: string = 'userId') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401);

      const targetId = req.params[paramName];
      if (!targetId) throw new AppError('Target user ID required', 400);

      const allowed = await canViewUser(
        req.user.userId,
        req.user.role,
        req.user.organizationId,
        targetId
      );

      if (!allowed) {
        throw new AppError("You don't have permission to view this user's data", 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
