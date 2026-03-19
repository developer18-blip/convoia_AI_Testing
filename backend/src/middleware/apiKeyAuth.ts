import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { AppError } from './errorHandler.js';
import logger from '../config/logger.js';

/**
 * Middleware that authenticates requests using an API key.
 * Accepts key via `x-api-key` header or `Authorization: Bearer cvai_...`.
 *
 * On success, populates req.user with the key owner's identity
 * so downstream handlers work identically to JWT-authenticated requests.
 */
export const apiKeyAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Extract key from x-api-key header or Bearer token starting with cvai_
    let rawKey: string | undefined =
      req.headers['x-api-key'] as string | undefined;

    if (!rawKey) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer cvai_')) {
        rawKey = authHeader.replace('Bearer ', '');
      }
    }

    if (!rawKey) {
      return next(new AppError('API key required (x-api-key header or Bearer cvai_...)', 401));
    }

    // Look up key
    const apiKey = await prisma.aPIKey.findUnique({
      where: { key: rawKey },
      include: {
        user: {
          select: { id: true, role: true, organizationId: true, isActive: true },
        },
      },
    });

    if (!apiKey) {
      return next(new AppError('Invalid API key', 401));
    }

    if (!apiKey.isActive) {
      return next(new AppError('API key has been revoked', 401));
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return next(new AppError('API key has expired', 401));
    }

    if (!apiKey.user.isActive) {
      return next(new AppError('Account is deactivated', 403));
    }

    // Populate req.user exactly like JWT middleware does
    req.user = {
      userId: apiKey.user.id,
      role: apiKey.user.role,
      organizationId: apiKey.user.organizationId || undefined,
    };

    // Update lastUsed (fire-and-forget, don't block the request)
    prisma.aPIKey
      .update({ where: { id: apiKey.id }, data: { lastUsed: new Date() } })
      .catch((err) => logger.error('Failed to update API key lastUsed', err));

    next();
  } catch (error) {
    next(new AppError('API key authentication failed', 401));
  }
};

/**
 * Middleware that accepts EITHER JWT Bearer token OR API key.
 * Useful for routes that should work with both auth methods.
 */
export const jwtOrApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If already authenticated via optionalAuth (JWT), skip
  if (req.user) {
    return next();
  }

  // Check for API key
  const hasApiKey =
    req.headers['x-api-key'] ||
    req.headers.authorization?.startsWith('Bearer cvai_');

  if (hasApiKey) {
    return apiKeyAuth(req, res, next);
  }

  // Neither JWT nor API key
  next(new AppError('Authentication required (JWT or API key)', 401));
};
