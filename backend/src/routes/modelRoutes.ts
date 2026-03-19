import { Router, Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/models — Public endpoint returning all active models
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const models = await prisma.aIModel.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      provider: true,
      modelId: true,
      description: true,
      inputTokenPrice: true,
      outputTokenPrice: true,
      markupPercentage: true,
      contextWindow: true,
      capabilities: true,
      isActive: true,
      createdAt: true,
    },
  });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Models retrieved successfully',
    data: models,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
