import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { generateToken, generateRefreshToken } from '../utils/token.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';
import { RegisterRequest, LoginRequest, AuthResponse } from '../types/index.js';
import { InviteService } from './inviteService.js';
import { EmailService } from './emailService.js';
import { NotificationService } from './notificationService.js';
import { OAuth2Client } from 'google-auth-library';
import config from '../config/env.js';

export class AuthService {
  static async register(data: RegisterRequest & { inviteToken?: string }): Promise<AuthResponse> {
    const { email, password, name, role, organizationName, industry, inviteToken } = data;

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new AppError('User already exists with this email', 400);
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 12);

      // Determine role:
      // - Creating org → org_owner (always)
      // - Self-registration (no org, no invite) → 'user' (individual/freelancer)
      // - Only invite acceptance can set 'employee' or 'manager'
      const resolvedRole = organizationName
        ? 'org_owner'
        : (inviteToken ? (role || 'employee') : 'user');

      // Use transaction to prevent orphan orgs if user creation fails
      const result = await prisma.$transaction(async (tx) => {
        let organizationId: string | undefined;

        // Create user first
        const user = await tx.user.create({
          data: {
            email,
            name,
            password: hashedPassword,
            role: resolvedRole,
          },
        });

        // Create organization if provided, with valid ownerId
        if (organizationName) {
          const organization = await tx.organization.create({
            data: {
              name: organizationName,
              email,
              ownerId: user.id,
              ...(industry ? { industry } : {}),
            },
          });
          organizationId = organization.id;

          // Link user to organization
          await tx.user.update({
            where: { id: user.id },
            data: { organizationId },
          });
        }

        // Create wallet for the user automatically
        await tx.wallet.create({
          data: {
            userId: user.id,
            balance: 0,
            totalToppedUp: 0,
            totalSpent: 0,
            currency: 'USD',
          },
        });

        return {
          ...user,
          organizationId: organizationId || null,
        };
      });

      logger.info(`New user registered: ${result.email}`);

      // If an invite token was provided, accept it (joins org + sets role)
      let finalUser = result;
      if (inviteToken) {
        try {
          await InviteService.acceptInvite({
            token: inviteToken,
            userId: result.id,
          });

          // Re-fetch user with updated org and role
          const updatedUser = await prisma.user.findUnique({
            where: { id: result.id },
          });

          if (updatedUser) {
            finalUser = {
              ...updatedUser,
              organizationId: updatedUser.organizationId || null,
            };
          }
        } catch (inviteErr: any) {
          logger.warn(`Invite accept failed during registration: ${inviteErr.message}`);
        }
      }

      // If invite-based registration, skip email verification (invite proves email ownership)
      if (inviteToken) {
        await prisma.user.update({
          where: { id: finalUser.id },
          data: { isVerified: true },
        });

        const token = generateToken({
          userId: finalUser.id,
          organizationId: finalUser.organizationId || undefined,
          role: finalUser.role,
        });
        const refreshToken = generateRefreshToken({
          userId: finalUser.id,
          organizationId: finalUser.organizationId || undefined,
          role: finalUser.role,
        });

        return {
          user: {
            id: finalUser.id,
            email: finalUser.email,
            name: finalUser.name,
            avatar: finalUser.avatar || null,
            role: finalUser.role,
            organizationId: finalUser.organizationId || undefined,
            isVerified: true,
          },
          token,
          refreshToken,
        };
      }

      // Auto-verify and issue token immediately (no OTP required)
      await prisma.user.update({
        where: { id: finalUser.id },
        data: { isVerified: true },
      });

      const token = generateToken({
        userId: finalUser.id,
        organizationId: finalUser.organizationId || undefined,
        role: finalUser.role,
      });
      const refreshToken = generateRefreshToken({
        userId: finalUser.id,
        organizationId: finalUser.organizationId || undefined,
        role: finalUser.role,
      });

      // Send welcome notification (fire and forget)
      NotificationService.onWelcome(finalUser.id, finalUser.name).catch(() => {});

      return {
        user: {
          id: finalUser.id,
          email: finalUser.email,
          name: finalUser.name,
          avatar: finalUser.avatar || null,
          role: finalUser.role,
          organizationId: finalUser.organizationId || undefined,
          isVerified: true,
        },
        token,
        refreshToken,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Registration error:', error);
      throw new AppError('Failed to register user', 500);
    }
  }

  /**
   * Verify email with 6-digit OTP code.
   */
  static async verifyEmail(email: string, code: string): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.isVerified) {
      throw new AppError('Email is already verified', 400);
    }

    if (!user.verificationToken || !user.verificationExpiry) {
      throw new AppError('No verification code found. Please register again.', 400);
    }

    if (new Date() > user.verificationExpiry) {
      throw new AppError('Verification code has expired. Please request a new one.', 400);
    }

    if (user.verificationToken !== code) {
      throw new AppError('Invalid verification code', 400);
    }

    // Mark user as verified and clear the code
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
        verificationExpiry: null,
      },
    });

    logger.info(`Email verified for user: ${user.email}`);

    const token = generateToken({
      userId: user.id,
      organizationId: user.organizationId || undefined,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({
      userId: user.id,
      organizationId: user.organizationId || undefined,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar || null,
        role: user.role,
        organizationId: user.organizationId || undefined,
        isVerified: true,
      },
      token,
      refreshToken,
    };
  }

  /**
   * Resend verification code.
   */
  static async resendVerificationCode(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.isVerified) {
      throw new AppError('Email is already verified', 400);
    }

    const verificationCode = crypto.randomInt(100000, 1000000).toString();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: verificationCode, verificationExpiry },
    });

    await EmailService.sendVerificationCode({
      recipientEmail: user.email,
      name: user.name,
      code: verificationCode,
    });

    logger.info(`Verification code resent to ${user.email}`);
  }

  static async googleAuth(idToken: string): Promise<AuthResponse> {
    const client = new OAuth2Client(config.googleClientId);

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: config.googleClientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new AppError('Invalid Google token', 401);
      }

      const { email, name, sub: googleId, picture } = payload;

      // Check if user exists by googleId or email
      let user = await prisma.user.findFirst({
        where: { OR: [{ googleId }, { email }] },
      });

      if (user) {
        // Existing user — link Google account if not already linked
        if (!user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId, authProvider: 'google', avatar: picture || user.avatar },
          });
        }

        if (!user.isActive) {
          throw new AppError('Account has been deactivated. Contact support.', 403);
        }

        logger.info(`Google login: ${user.email}`);
      } else {
        // New user — create account
        user = await prisma.$transaction(async (tx) => {
          const newUser = await tx.user.create({
            data: {
              email: email!,
              name: name || email!.split('@')[0],
              password: null,
              avatar: picture || null,
              authProvider: 'google',
              googleId,
              role: 'user',
              isVerified: true,
            },
          });

          await tx.wallet.create({
            data: { userId: newUser.id, balance: 0, totalToppedUp: 0, totalSpent: 0, currency: 'USD' },
          });

          return newUser;
        });

        logger.info(`New Google user registered: ${user.email}`);
      }

      const token = generateToken({
        userId: user.id,
        organizationId: user.organizationId || undefined,
        role: user.role,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id,
        organizationId: user.organizationId || undefined,
        role: user.role,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar || null,
          role: user.role,
          organizationId: user.organizationId || undefined,
          isVerified: user.isVerified ?? true,
        },
        token,
        refreshToken,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Google auth error:', error);
      throw new AppError('Google authentication failed', 401);
    }
  }

  static async login(data: LoginRequest): Promise<AuthResponse> {
    const { email, password } = data;

    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      // Check if account is active
      if (!user.isActive) {
        throw new AppError('Account has been deactivated. Contact support.', 403);
      }

      // If user signed up via Google and has no password
      if (!user.password) {
        throw new AppError('This account uses Google sign-in. Please use the Google button to log in.', 400);
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        throw new AppError('Invalid credentials', 401);
      }

      // Auto-verify on login if somehow not verified
      if (!user.isVerified) {
        await prisma.user.update({ where: { id: user.id }, data: { isVerified: true } });
      }

      logger.info(`User logged in: ${user.email}`);

      // Send login notification (fire and forget)
      NotificationService.onLogin(user.id, user.name).catch(() => {});

      const token = generateToken({
        userId: user.id,
        organizationId: user.organizationId || undefined,
        role: user.role,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id,
        organizationId: user.organizationId || undefined,
        role: user.role,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar || null,
          role: user.role,
          organizationId: user.organizationId || undefined,
          isVerified: user.isVerified ?? false,
        },
        token,
        refreshToken,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Login error:', error);
      throw new AppError('Failed to login', 500);
    }
  }

  static async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        isVerified: true,
        isActive: true,
        organizationId: true,
        organization: {
          select: { name: true, tier: true },
        },
        wallet: {
          select: { balance: true, currency: true },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  static async updateProfile(userId: string, data: { name: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name: data.name },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        isVerified: true,
      },
    });

    logger.info(`Profile updated for user: ${updated.email}`);
    return updated;
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.password) {
      throw new AppError('This account uses Google sign-in and has no password. Please use Google to log in.', 400);
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      throw new AppError('Current password is incorrect', 401);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    logger.info(`Password changed for user: ${user.email}`);
  }

  static async refreshAccessToken(
    oldRefreshToken: string
  ): Promise<{ token: string; refreshToken: string }> {
    try {
      const { verifyRefreshToken } = await import('../utils/token.js');
      const payload = verifyRefreshToken(oldRefreshToken);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || !user.isActive) {
        throw new AppError('Invalid refresh token', 401);
      }

      const jwtPayload = {
        userId: user.id,
        organizationId: user.organizationId || undefined,
        role: user.role,
      };

      // Issue new access token + new refresh token (rotation)
      const token = generateToken(jwtPayload);
      const refreshToken = generateRefreshToken(jwtPayload);

      return { token, refreshToken };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Invalid or expired refresh token', 401);
    }
  }
}

export default AuthService;
