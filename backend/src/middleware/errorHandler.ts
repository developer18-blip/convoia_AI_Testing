import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.js';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof AppError) {
    logger.error(`${error.statusCode} - ${error.message}`, {
      path: req.path,
      method: req.method,
    });

    res.status(error.statusCode).json({
      success: false,
      statusCode: error.statusCode,
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Unexpected error
  logger.error('Unexpected error:', error);

  res.status(500).json({
    success: false,
    statusCode: 500,
    message: 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
};

export const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      if (error instanceof AppError) {
        next(error);
      } else {
        next(new AppError(error.message || 'Internal Server Error', 500));
      }
    });
  };
