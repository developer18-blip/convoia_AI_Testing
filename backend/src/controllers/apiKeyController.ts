import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { generateAPIKey, maskAPIKey } from '../utils/token.js';
import { isValidUUID } from '../utils/validators.js';
import logger from '../config/logger.js';

// ============ CREATE API KEY ============
export const createApiKey = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { name, expiresInDays } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new AppError('API key name is required (min 2 characters)', 400);
    }

    // Limit keys per user
    const existingKeys = await prisma.aPIKey.count({
      where: { userId: req.user.userId, isActive: true },
    });

    if (existingKeys >= 10) {
      throw new AppError('Maximum 10 active API keys per user', 400);
    }

    const rawKey = generateAPIKey();

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await prisma.aPIKey.create({
      data: {
        key: rawKey,
        name: name.trim(),
        userId: req.user.userId,
        organizationId: req.user.organizationId || null,
        expiresAt,
      },
    });

    logger.info(
      `API key created: user=${req.user.userId} name="${name.trim()}"`
    );

    // Return the raw key ONLY on creation — it cannot be retrieved later
    res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'API key created. Save this key — it cannot be shown again.',
      data: {
        id: apiKey.id,
        key: rawKey,
        name: apiKey.name,
        expiresAt: apiKey.expiresAt?.toISOString() || null,
        createdAt: apiKey.createdAt.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ LIST API KEYS ============
export const listApiKeys = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const keys = await prisma.aPIKey.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        key: true,
        name: true,
        isActive: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      statusCode: 200,
      message: 'API keys retrieved',
      data: keys.map((k) => ({
        id: k.id,
        maskedKey: maskAPIKey(k.key),
        name: k.name,
        isActive: k.isActive,
        isExpired: k.expiresAt ? k.expiresAt < new Date() : false,
        lastUsed: k.lastUsed?.toISOString() || null,
        expiresAt: k.expiresAt?.toISOString() || null,
        createdAt: k.createdAt.toISOString(),
      })),
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ REVOKE API KEY ============
export const revokeApiKey = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { keyId } = req.params;

    if (!isValidUUID(keyId)) {
      throw new AppError('Invalid API key ID format', 400);
    }

    const apiKey = await prisma.aPIKey.findUnique({
      where: { id: keyId },
    });

    if (!apiKey) {
      throw new AppError('API key not found', 404);
    }

    // Only owner or admin can revoke
    const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);
    if (apiKey.userId !== req.user.userId && !isAdmin) {
      throw new AppError('Unauthorized to revoke this key', 403);
    }

    await prisma.aPIKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });

    logger.info(
      `API key revoked: keyId=${keyId} by user=${req.user.userId}`
    );

    res.json({
      success: true,
      statusCode: 200,
      message: 'API key revoked',
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ ROTATE API KEY ============
export const rotateApiKey = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { keyId } = req.params;

    if (!isValidUUID(keyId)) {
      throw new AppError('Invalid API key ID format', 400);
    }

    const oldKey = await prisma.aPIKey.findUnique({
      where: { id: keyId },
    });

    if (!oldKey) {
      throw new AppError('API key not found', 404);
    }

    if (oldKey.userId !== req.user.userId) {
      throw new AppError('Unauthorized to rotate this key', 403);
    }

    if (!oldKey.isActive) {
      throw new AppError('Cannot rotate an inactive key', 400);
    }

    const newRawKey = generateAPIKey();

    // Atomic: deactivate old, create new
    const result = await prisma.$transaction(async (tx) => {
      await tx.aPIKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      const newKey = await tx.aPIKey.create({
        data: {
          key: newRawKey,
          name: oldKey.name,
          userId: oldKey.userId,
          organizationId: oldKey.organizationId,
          expiresAt: oldKey.expiresAt,
        },
      });

      return newKey;
    });

    logger.info(
      `API key rotated: oldKeyId=${keyId} newKeyId=${result.id} user=${req.user.userId}`
    );

    res.json({
      success: true,
      statusCode: 200,
      message: 'API key rotated. Save the new key — it cannot be shown again.',
      data: {
        id: result.id,
        key: newRawKey,
        name: result.name,
        expiresAt: result.expiresAt?.toISOString() || null,
        createdAt: result.createdAt.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);
