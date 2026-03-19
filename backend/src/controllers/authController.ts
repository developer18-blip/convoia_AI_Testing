import { Request, Response } from 'express';
import AuthService from '../services/authService.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { isValidEmail } from '../utils/validators.js';
import { sanitizeEmail, validatePasswordStrength } from '../utils/security.js';
import { RegisterRequest, LoginRequest } from '../types/index.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name, role, organizationName, industry, inviteToken } = req.body as RegisterRequest & { inviteToken?: string };

  // Validate input exists
  if (!email || !password || !name) {
    throw new AppError('Email, password, and name are required', 400);
  }

  // Validate role if provided
  const validRoles = ['platform_admin', 'org_owner', 'manager', 'employee'];
  if (role && !validRoles.includes(role)) {
    throw new AppError(
      `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      400
    );
  }

  // Validate email format
  const sanitizedEmail = sanitizeEmail(email);
  if (!isValidEmail(sanitizedEmail)) {
    throw new AppError('Invalid email format', 400);
  }

  // Validate password strength
  const passwordCheck = validatePasswordStrength(password);
  if (!passwordCheck.isStrong) {
    throw new AppError(
      `Password is not strong enough. ${passwordCheck.feedback.join(', ')}`,
      400
    );
  }

  const result = await AuthService.register({
    email: sanitizedEmail,
    password,
    name,
    role,
    organizationName,
    industry,
    inviteToken,
  });

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'User registered successfully',
    data: result,
    timestamp: new Date().toISOString(),
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginRequest;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  const sanitizedEmail = sanitizeEmail(email);
  if (!isValidEmail(sanitizedEmail)) {
    throw new AppError('Invalid credentials', 401);
  }

  const result = await AuthService.login({
    email: sanitizedEmail,
    password,
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Login successful',
    data: result,
    timestamp: new Date().toISOString(),
  });
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await AuthService.getUserById(req.user.userId);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Profile retrieved successfully',
    data: user,
    timestamp: new Date().toISOString(),
  });
});

export const verifyToken = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  res.json({
    success: true,
    statusCode: 200,
    message: 'Token is valid',
    data: {
      userId: req.user.userId,
      role: req.user.role,
      organizationId: req.user.organizationId,
    },
    timestamp: new Date().toISOString(),
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new AppError('Name is required', 400);
  }

  const user = await AuthService.updateProfile(req.user.userId, { name: name.trim() });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Profile updated successfully',
    data: user,
    timestamp: new Date().toISOString(),
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new AppError('Current password and new password are required', 400);
  }

  const passwordCheck = validatePasswordStrength(newPassword);
  if (!passwordCheck.isStrong) {
    throw new AppError(
      `New password is not strong enough. ${passwordCheck.feedback.join(', ')}`,
      400
    );
  }

  await AuthService.changePassword(req.user.userId, currentPassword, newPassword);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Password changed successfully',
    data: null,
    timestamp: new Date().toISOString(),
  });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  // Accept refresh token from body or cookie
  const token = req.body.refreshToken || req.cookies?.refreshToken;

  if (!token) {
    throw new AppError('Refresh token is required (body or cookie)', 400);
  }

  const result = await AuthService.refreshAccessToken(token);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Token refreshed successfully',
    data: result,
    timestamp: new Date().toISOString(),
  });
});
