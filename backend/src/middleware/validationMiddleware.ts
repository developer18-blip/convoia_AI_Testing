import { Request, Response, NextFunction } from 'express';
import { validationResult, body, query, param } from 'express-validator';
import { AppError } from './errorHandler.js';

/**
 * Validation middleware that checks for validation errors
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: 'param' in err ? err.param : 'unknown',
      message: err.msg,
    }));

    throw new AppError(`Validation failed: ${formattedErrors.map((e) => e.message).join(', ')}`, 400);
  }
  next();
};

/**
 * Validation rules for authentication
 */
export const authValidationRules = () => {
  return [
    body('email')
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email format')
      .isLength({ max: 255 })
      .withMessage('Email too long'),

    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/)
      .withMessage('Password must contain uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain lowercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain number')
      .matches(/[!@#$%^&*]/)
      .withMessage('Password must contain special character'),

    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be 2-100 characters')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name contains invalid characters'),

    body('organizationName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Organization name must be 2-100 characters')
      .matches(/^[a-zA-Z0-9\s'-]+$/)
      .withMessage('Organization name contains invalid characters'),
  ];
};

/**
 * Validation rules for AI query
 */
export const aiQueryValidationRules = () => {
  return [
    body('model')
      .trim()
      .notEmpty()
      .withMessage('Model is required')
      .isLength({ max: 100 })
      .withMessage('Model name too long')
      .matches(/^[a-zA-Z0-9\-_.]+$/)
      .withMessage('Invalid model name'),

    body('prompt')
      .trim()
      .notEmpty()
      .withMessage('Prompt cannot be empty')
      .isLength({ min: 1, max: 10000 })
      .withMessage('Prompt must be 1-10000 characters'),

    body('temperature')
      .optional()
      .isFloat({ min: 0, max: 2 })
      .withMessage('Temperature must be between 0 and 2'),

    body('maxTokens')
      .optional()
      .isInt({ min: 1, max: 32000 })
      .withMessage('Max tokens must be between 1 and 32000'),
  ];
};

/**
 * Validation rules for model comparison
 */
export const modelComparisonValidationRules = () => {
  return [
    body('models')
      .isArray({ min: 2, max: 5 })
      .withMessage('Must provide 2-5 models'),

    body('models.*')
      .trim()
      .matches(/^[a-zA-Z0-9\-_.]+$/)
      .withMessage('Invalid model name'),

    body('prompt')
      .trim()
      .notEmpty()
      .withMessage('Prompt cannot be empty')
      .isLength({ min: 1, max: 10000 })
      .withMessage('Prompt must be 1-10000 characters'),
  ];
};

/**
 * Pagination validation
 */
export const paginationValidationRules = () => {
  return [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),

    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),

    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),

    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format'),
  ];
};

/**
 * UUID validation
 */
export const validateUUID = () => {
  return param('id')
    .isUUID()
    .withMessage('Invalid ID format');
};
