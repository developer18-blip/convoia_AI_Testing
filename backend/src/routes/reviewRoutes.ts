import { Router, Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import logger from '../config/logger.js';

const router = Router();

// GET /api/reviews — Public: list all approved reviews
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const reviews = await prisma.review.findMany({
    where: { isPublic: true },
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: {
      id: true,
      name: true,
      role: true,
      company: true,
      avatar: true,
      rating: true,
      title: true,
      content: true,
      isFeatured: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: reviews });
}));

// POST /api/reviews — Auth required: submit a review
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { rating, title, content, role, company } = req.body;

  if (!title || !content) throw new AppError('Title and content are required', 400);
  if (!rating || rating < 1 || rating > 5) throw new AppError('Rating must be 1-5', 400);

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true, avatar: true },
  });

  if (!user) throw new AppError('User not found', 404);

  // Check if user already submitted a review
  const existing = await prisma.review.findFirst({
    where: { userId: user.id },
  });

  if (existing) {
    // Update existing review
    const updated = await prisma.review.update({
      where: { id: existing.id },
      data: { rating, title, content, role: role || undefined, company: company || undefined, name: user.name, avatar: user.avatar },
    });
    logger.info(`Review updated by ${user.name}`);
    res.json({ success: true, message: 'Review updated', data: updated });
  } else {
    const review = await prisma.review.create({
      data: {
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        rating,
        title,
        content,
        role: role || undefined,
        company: company || undefined,
      },
    });
    logger.info(`Review submitted by ${user.name}`);
    res.status(201).json({ success: true, message: 'Review submitted! It will appear on the homepage.', data: review });
  }
}));

// DELETE /api/reviews/:id — Owner or admin can delete
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw new AppError('Review not found', 404);

  const isOwner = review.userId === req.user!.userId;
  const isAdmin = req.user!.role === 'platform_admin';

  if (!isOwner && !isAdmin) throw new AppError('Unauthorized', 403);

  await prisma.review.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Review deleted' });
}));

export default router;
