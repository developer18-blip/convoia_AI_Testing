import { Router, Request, Response } from 'express';
import { FactCategory, FactSource } from '@prisma/client';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

const VALID_CATEGORIES = Object.values(FactCategory);
const TOP_OF_MIND_TTL_MS = 14 * 24 * 60 * 60 * 1000;

// GET /api/user/facts — list grouped by category
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const now = new Date();
  const facts = await prisma.userFact.findMany({
    where: {
      userId,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ category: 'asc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
  });

  const grouped: Record<string, typeof facts> = {
    WORK: [],
    PERSONAL: [],
    TOP_OF_MIND: [],
    HISTORY: [],
  };
  for (const f of facts) {
    grouped[f.category].push(f);
  }

  res.json({ success: true, data: { facts: grouped, total: facts.length } });
}));

// POST /api/user/facts — add manual fact (USER_ADDED)
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { category, content } = req.body ?? {};

  if (!category || !VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ success: false, message: 'Invalid category' });
    return;
  }
  if (typeof content !== 'string' || content.trim().length < 1 || content.length > 500) {
    res.status(400).json({ success: false, message: 'Content must be 1-500 chars' });
    return;
  }

  const expiresAt = category === FactCategory.TOP_OF_MIND
    ? new Date(Date.now() + TOP_OF_MIND_TTL_MS)
    : null;

  const fact = await prisma.userFact.create({
    data: {
      userId,
      category,
      content: content.trim(),
      source: FactSource.USER_ADDED,
      confidence: 1.0,
      expiresAt,
    },
  });

  res.status(201).json({ success: true, data: fact });
}));

// PATCH /api/user/facts/:id — edit content/category
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;
  const { category, content } = req.body ?? {};

  const existing = await prisma.userFact.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  const updates: { category?: FactCategory; content?: string; expiresAt?: Date | null } = {};

  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ success: false, message: 'Invalid category' });
      return;
    }
    updates.category = category;
    // Recompute expiry on category change
    updates.expiresAt = category === FactCategory.TOP_OF_MIND
      ? new Date(Date.now() + TOP_OF_MIND_TTL_MS)
      : null;
  }

  if (content !== undefined) {
    if (typeof content !== 'string' || content.trim().length < 1 || content.length > 500) {
      res.status(400).json({ success: false, message: 'Content must be 1-500 chars' });
      return;
    }
    updates.content = content.trim();
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ success: false, message: 'No fields to update' });
    return;
  }

  const fact = await prisma.userFact.update({ where: { id }, data: updates });
  res.json({ success: true, data: fact });
}));

// DELETE /api/user/facts/:id — soft delete (active=false)
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const existing = await prisma.userFact.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  await prisma.userFact.update({ where: { id }, data: { active: false } });
  res.json({ success: true, message: 'Deactivated' });
}));

// DELETE /api/user/facts?category=X|?all=true — bulk soft delete
router.delete('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { category, all } = req.query;

  const where: { userId: string; active: true; category?: FactCategory } = {
    userId,
    active: true,
  };

  if (all === 'true') {
    // Nuclear: deactivate all active facts for this user
  } else if (typeof category === 'string') {
    if (!VALID_CATEGORIES.includes(category as FactCategory)) {
      res.status(400).json({ success: false, message: 'Invalid category' });
      return;
    }
    where.category = category as FactCategory;
  } else {
    res.status(400).json({ success: false, message: 'Specify ?category=X or ?all=true' });
    return;
  }

  const result = await prisma.userFact.updateMany({ where, data: { active: false } });
  logger.info(`Bulk fact delete: user=${userId} ${all === 'true' ? 'all' : `category=${category}`} deactivated=${result.count}`);
  res.json({ success: true, deactivated: result.count });
}));

export default router;
