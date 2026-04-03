import { Router, Request, Response } from 'express';
import prismaClient from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import logger from '../config/logger.js';

// Cast to any until prisma generate runs with new Conversation/ChatMessage models
const prisma = prismaClient as any;

const router = Router();
router.use(authMiddleware);

// GET /api/conversations — List all conversations for current user
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const conversations = await prisma.conversation.findMany({
    where: { userId: req.user!.userId },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
    select: {
      id: true, title: true, modelName: true, agentId: true,
      industry: true, isPinned: true, folderId: true,
      totalCost: true, totalTokens: true,
      createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  res.json({
    success: true,
    data: conversations.map((c: any) => ({
      ...c,
      messageCount: c._count.messages,
      _count: undefined,
    })),
  });
}));

// GET /api/conversations/:id — Get a conversation with messages
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conv = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 500,
      },
    },
  });

  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  res.json({ success: true, data: conv });
}));

// POST /api/conversations — Create a new conversation
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { title, modelId, modelName, agentId, industry } = req.body;

  const conv = await prisma.conversation.create({
    data: {
      userId: req.user!.userId,
      title: title || 'New Chat',
      modelId, modelName, agentId, industry,
    },
  });

  res.status(201).json({ success: true, data: conv });
}));

// PUT /api/conversations/:id — Update conversation (title, pin, folder)
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  const { title, isPinned, folderId } = req.body;
  const updated = await prisma.conversation.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(isPinned !== undefined && { isPinned }),
      ...(folderId !== undefined && { folderId }),
    },
  });

  res.json({ success: true, data: updated });
}));

// DELETE /api/conversations/:id — Delete a conversation
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  await prisma.conversation.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Conversation deleted' });
}));

// POST /api/conversations/:id/messages — Save messages to a conversation
router.post('/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('messages array is required', 400);
  }

  // Upsert messages (create if new, skip if exists)
  const created = await prisma.$transaction(
    messages.map((msg: any) =>
      prisma.chatMessage.upsert({
        where: { id: msg.id },
        create: {
          id: msg.id,
          conversationId: req.params.id,
          role: msg.role,
          content: msg.content || '',
          model: msg.model,
          provider: msg.provider,
          tokensInput: msg.tokensInput || null,
          tokensOutput: msg.tokensOutput || null,
          cost: msg.cost || null,
          imageUrl: msg.imageUrl || null,
          imagePrompt: msg.imagePrompt || null,
          videoUrl: msg.videoUrl || null,
          webSearchData: msg.webSearchData ? JSON.stringify(msg.webSearchData) : null,
        },
        update: {
          // Update if video/image URL was added after initial save
          ...(msg.videoUrl ? { videoUrl: msg.videoUrl } : {}),
          ...(msg.imageUrl ? { imageUrl: msg.imageUrl } : {}),
        },
      })
    )
  );

  // Update conversation metadata
  const firstUserMsg = messages.find((m: any) => m.role === 'user');
  const totalTokens = messages.reduce((s: number, m: any) => s + (m.tokensInput || 0) + (m.tokensOutput || 0), 0);
  const totalCost = messages.reduce((s: number, m: any) => s + (m.cost || 0), 0);

  await prisma.conversation.update({
    where: { id: req.params.id },
    data: {
      ...(conv.title === 'New Chat' && firstUserMsg ? { title: firstUserMsg.content.substring(0, 60) } : {}),
      totalTokens: { increment: totalTokens },
      totalCost: { increment: totalCost },
      updatedAt: new Date(),
    },
  });

  res.json({ success: true, data: { saved: created.length } });
}));

// POST /api/conversations/sync — Bulk sync from localStorage (migration)
router.post('/sync', asyncHandler(async (req: Request, res: Response) => {
  const { conversations } = req.body;
  if (!conversations || !Array.isArray(conversations)) {
    throw new AppError('conversations array is required', 400);
  }

  let synced = 0;
  for (const conv of conversations.slice(0, 100)) {
    try {
      // Create conversation
      const created = await prisma.conversation.upsert({
        where: { id: conv.id },
        create: {
          id: conv.id,
          userId: req.user!.userId,
          title: conv.title || 'New Chat',
          modelName: conv.modelName,
          totalCost: conv.totalCost || 0,
          totalTokens: conv.totalTokens || 0,
          createdAt: conv.createdAt ? new Date(conv.createdAt) : new Date(),
          updatedAt: conv.updatedAt ? new Date(conv.updatedAt) : new Date(),
        },
        update: {},
      });

      // Save messages
      if (conv.messages?.length > 0) {
        for (const msg of conv.messages.slice(0, 500)) {
          await prisma.chatMessage.upsert({
            where: { id: msg.id },
            create: {
              id: msg.id,
              conversationId: created.id,
              role: msg.role,
              content: msg.content || '',
              model: msg.model,
              provider: msg.provider,
              tokensInput: msg.tokensInput || null,
              tokensOutput: msg.tokensOutput || null,
              cost: msg.cost || null,
              imageUrl: msg.imageUrl || null,
              videoUrl: msg.videoUrl || null,
              createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            },
            update: {},
          });
        }
      }
      synced++;
    } catch (err: any) {
      logger.warn(`Failed to sync conversation ${conv.id}: ${err.message}`);
    }
  }

  logger.info(`Synced ${synced} conversations for user ${req.user!.userId}`);
  res.json({ success: true, data: { synced } });
}));

export default router;
