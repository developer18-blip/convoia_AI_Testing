import { Request, Response, NextFunction } from 'express';
import { asyncHandler, AppError } from './errorHandler.js';
import prisma from '../config/db.js';

/**
 * Ensure authenticated user belongs to an organization.
 * Attaches `req.userOrg` for downstream use.
 */
export const requireOrg = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
  });

  if (!user?.organizationId) {
    throw new AppError('This feature requires organization membership', 403);
  }

  (req as any).userOrg = user.organizationId;
  next();
});

/**
 * Ensure user is org_owner or platform_admin.
 */
export const requireOrgOwner = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
  });

  if (user?.role !== 'org_owner' && user?.role !== 'platform_admin') {
    throw new AppError('Only organization owners can perform this action', 403);
  }

  next();
});

/**
 * Ensure user is manager, org_owner, or platform_admin.
 */
export const requireManager = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
  });

  const managerRoles = ['org_owner', 'manager', 'platform_admin'];
  if (!managerRoles.includes(user?.role ?? '')) {
    throw new AppError('Manager access required', 403);
  }

  next();
});

/**
 * Ensure the target resource belongs to the user's org.
 * Takes a function that extracts the target org ID from the request.
 */
export const requireSameOrg = (getTargetOrgId: (req: Request) => Promise<string>) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    const targetOrgId = await getTargetOrgId(req);

    if (user?.role !== 'platform_admin' && user?.organizationId !== targetOrgId) {
      throw new AppError('Access denied: different organization', 403);
    }

    next();
  });
