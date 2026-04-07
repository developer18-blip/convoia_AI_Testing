import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import AuthService from '../services/authService.js';
import prisma from '../config/db.js';
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

// Helper: check if user's org allows avatar changes for employees/managers
async function checkAvatarPermission(role: string, orgId: string | null | undefined) {
  if (!orgId || role === 'org_owner' || role === 'platform_admin' || role === 'user') return;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });
    // allowEmployeeAvatar defaults to true; only block if explicitly false
    if (org && (org as any).allowEmployeeAvatar === false) {
      throw new AppError('Your organization does not allow profile picture changes. Contact your owner.', 403);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // If field doesn't exist yet (pre-migration), allow by default
  }
}

export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  if (!req.file) throw new AppError('No file uploaded', 400);

  await checkAvatarPermission(req.user.role, req.user.organizationId);

  // Move from temp to avatars directory
  const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const filename = `${req.user.userId}${ext}`;
  const destPath = path.join(avatarsDir, filename);

  // Remove old avatar file if exists
  const oldFiles = fs.readdirSync(avatarsDir).filter(f => f.startsWith(req.user!.userId));
  oldFiles.forEach(f => { try { fs.unlinkSync(path.join(avatarsDir, f)); } catch {} });

  fs.renameSync(req.file.path, destPath);

  // Add timestamp to bust browser cache when re-uploading
  const avatarUrl = `/api/uploads/avatars/${filename}?v=${Date.now()}`;

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { avatar: avatarUrl },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Avatar updated',
    data: { avatar: avatarUrl },
    timestamp: new Date().toISOString(),
  });
});

export const selectAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  await checkAvatarPermission(req.user.role, req.user.organizationId);

  const { avatarId } = req.body;
  if (!avatarId || typeof avatarId !== 'string') throw new AppError('avatarId is required', 400);

  // Built-in avatars are served from frontend public directory
  const avatarUrl = `/avatars/${avatarId}.svg`;

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { avatar: avatarUrl },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Avatar updated',
    data: { avatar: avatarUrl },
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

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body;

  if (!email || !code) {
    throw new AppError('Email and verification code are required', 400);
  }

  if (!/^\d{6}$/.test(code)) {
    throw new AppError('Verification code must be 6 digits', 400);
  }

  const result = await AuthService.verifyEmail(email, code);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Email verified successfully',
    data: result,
    timestamp: new Date().toISOString(),
  });
});

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400);
  }

  await AuthService.resendVerificationCode(email);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Verification code sent',
    data: null,
    timestamp: new Date().toISOString(),
  });
});

export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new AppError('Google ID token is required', 400);
  }

  const result = await AuthService.googleAuth(idToken);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Google authentication successful',
    data: result,
    timestamp: new Date().toISOString(),
  });
});

// ─── Mobile Google OAuth (server-side redirect flow) ───────────────────
// Google's GIS library blocks WebViews, so mobile uses server-side OAuth.
// Flow: mobile opens /auth/google/mobile → Google consent → /auth/google/callback → redirect to app
import config from '../config/env.js';
import { OAuth2Client } from 'google-auth-library';

const mobileOAuthClient = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  // Callback URL — must match Google Cloud Console redirect URI
  `${process.env.BACKEND_URL || 'https://intellect.convoia.com'}/api/auth/google/callback`
);

export const googleMobileRedirect = asyncHandler(async (_req: Request, res: Response) => {
  const authorizeUrl = mobileOAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(authorizeUrl);
});

export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    res.redirect('https://localhost/login?error=google_failed');
    return;
  }

  try {
    // Exchange code for tokens
    const { tokens } = await mobileOAuthClient.getToken(code);
    const idToken = tokens.id_token;
    if (!idToken) {
      res.redirect('https://localhost/login?error=no_token');
      return;
    }

    // Reuse existing googleAuth service
    const result = await AuthService.googleAuth(idToken);

    // Redirect back to mobile app via deep link (convoia://auth?token=xxx)
    const params = new URLSearchParams();
    params.set('token', result.token);
    params.set('refreshToken', result.refreshToken || '');
    params.set('user', JSON.stringify({ id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role, avatar: result.user.avatar }));
    res.redirect(`convoia://auth?${params.toString()}`);
  } catch (err: any) {
    // On failure, show a simple error page (can't deep-link errors reliably)
    res.status(400).send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
      <h2>Google Sign-In Failed</h2><p>${err.message || 'Something went wrong'}</p>
      <p>Please go back to the app and try again.</p></body></html>`);
  }
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

// ── Forgot Password — send reset link via email ─────────────────────
import crypto from 'crypto';
import { EmailService } from '../services/emailService.js';

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    throw new AppError('Valid email is required', 400);
  }

  const user = await prisma.user.findUnique({ where: { email: sanitizeEmail(email) } });

  // Always return success to prevent email enumeration
  if (!user || user.authProvider !== 'local') {
    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    return;
  }

  // Generate secure reset token (64 hex chars)
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  // Send reset email
  await EmailService.sendPasswordResetEmail({
    recipientEmail: user.email,
    name: user.name,
    resetToken,
  });

  res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
});

// ── Reset Password — validate token and set new password ────────────

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || !password) {
    throw new AppError('Token and new password are required', 400);
  }

  const strength = validatePasswordStrength(password);
  if (!strength.isStrong) {
    throw new AppError(strength.feedback.join('. ') || 'Password is too weak', 400);
  }

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    throw new AppError('Invalid or expired reset link. Please request a new one.', 400);
  }

  // Hash new password and clear reset token
  const bcryptModule = await import('bcryptjs');
  const bcrypt = bcryptModule.default || bcryptModule;
  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
});
