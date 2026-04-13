import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import prisma from '../config/db.js';
import { AppError } from './errorHandler.js';

export interface JWTPayload {
  userId: string;
  organizationId?: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      token?: string;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No authentication token provided', 401);
    }

    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

    // Email verification + active-account enforcement. This is cheap
    // (one indexed lookup on User.id). Existing users were backfilled
    // to isVerified=true before deploy, so only new self-registrations
    // that haven't completed the OTP flow are blocked here.
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { isVerified: true, isActive: true },
    });
    if (!user) {
      return next(new AppError('User not found', 401));
    }
    if (!user.isActive) {
      return next(new AppError('Account is deactivated', 403));
    }
    if (!user.isVerified) {
      res.status(403).json({
        success: false,
        statusCode: 403,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address before using the platform',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.user = decoded;
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid or expired token', 401));
    } else if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError('Authentication failed', 401));
    }
  }
};

export const optionalAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
      req.user = decoded;
      req.token = token;
    }
  } catch (error) {
    // Silently ignore auth errors for optional auth
  }

  next();
};

export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
};
