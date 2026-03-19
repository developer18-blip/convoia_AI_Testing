import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { generateToken, generateRefreshToken } from '../utils/token.js';
import { AppError } from '../middleware/errorHandler.js';
import logger from '../config/logger.js';
import { RegisterRequest, LoginRequest, AuthResponse } from '../types/index.js';
import { InviteService } from './inviteService.js';

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

      // Determine role: org_owner forced when org provided > explicit role > employee
      // Creating an org always means org_owner (prevents employee+org mismatch)
      const resolvedRole = organizationName
        ? (role === 'manager' ? 'manager' : 'org_owner')
        : role || 'employee';

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
          role: finalUser.role,
          organizationId: finalUser.organizationId || undefined,
          isVerified: false,
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

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        throw new AppError('Invalid credentials', 401);
      }

      logger.info(`User logged in: ${user.email}`);

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
