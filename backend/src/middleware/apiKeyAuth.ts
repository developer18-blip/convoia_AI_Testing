import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { AppError } from './errorHandler.js';
import logger from '../config/logger.js';

/**
 * SHA-256 hash of a raw API key. We only ever store this hash in the
 * database; the plaintext is returned to the user once at creation and
 * never again. This means a DB dump gives an attacker no usable keys.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * First 12 characters of a raw key — stored alongside the hash so the
 * list-keys UI can show users which key is which without needing the
 * plaintext. (e.g. "cvai_fac4614d")
 */
export function apiKeyPrefix(rawKey: string): string {
  return rawKey.substring(0, 12);
}

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

    // Hash the incoming key and look it up. The DB only stores the
    // SHA-256 hash; we never compare plaintext.
    const hashed = hashApiKey(rawKey);
    const apiKey = await prisma.aPIKey.findUnique({
      where: { key: hashed },
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
