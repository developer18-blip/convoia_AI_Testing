import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
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

export const authMiddleware = (
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
      throw new AppError('User not authenticated', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('Insufficient permissions', 403);
    }

    next();
  };
};
