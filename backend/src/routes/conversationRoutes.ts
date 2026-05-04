import { Router, Request, Response } from 'express';
import prismaClient from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { isValidUUID } from '../utils/validators.js';
import logger from '../config/logger.js';

// Cast to any until prisma generate runs with new Conversation/ChatMessage models
const prisma = prismaClient as any;

const router = Router();
router.use(authMiddleware);

// GET /api/conversations — List conversations with cursor pagination
// Query params: limit (default 50, max 100), cursor (updatedAt ISO string)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const cursor = req.query.cursor as string | undefined;

  const conversations = await prisma.conversation.findMany({
    where: {
      userId: req.user!.userId,
      ...(cursor ? { updatedAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    take: limit + 1, // one extra to detect "more available"
    select: {
      id: true, title: true, modelName: true, agentId: true,
      industry: true, isPinned: true, folderId: true,
      totalCost: true, totalTokens: true,
      createdAt: true, updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  const hasMore = conversations.length > limit;
  const page = hasMore ? conversations.slice(0, limit) : conversations;
  const nextCursor = hasMore ? page[page.length - 1].updatedAt.toISOString() : null;

  const nonEmpty = page.filter((c: any) => c._count.messages > 0);

  res.json({
    success: true,
    data: nonEmpty.map((c: any) => ({
      ...c,
      messageCount: c._count.messages,
      _count: undefined,
    })),
    nextCursor,
  });
}));

// GET /api/conversations/:id — Get a conversation with paginated messages
// Query params: limit (default 100, max 500), before (message id for cursor)
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const before = req.query.before as string | undefined;

  const conv = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, userId: true, title: true, modelId: true, modelName: true,
      agentId: true, industry: true, isPinned: true, folderId: true,
      totalCost: true, totalTokens: true, createdAt: true, updatedAt: true,
    },
  });

  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  // Load newest messages first (cursor), then reverse for chronological order
  const msgs = await prisma.chatMessage.findMany({
    where: {
      conversationId: req.params.id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = msgs.length > limit;
  const page = hasMore ? msgs.slice(0, limit) : msgs;
  const nextBefore = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  res.json({
    success: true,
    data: { ...conv, messages: page.reverse() },
    nextBefore,
  });
}));

// POST /api/conversations — Create a new conversation
// Accepts a client-provided `id` so the frontend's local conversation id
// matches what lands in the DB. Without this, every subsequent call to
// /:id/messages 404s because the backend generated a different UUID than
// the one the frontend is tracking. Upsert makes the call idempotent if
// the same id is sent twice (retry/race).
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { id, title, modelId, modelName, agentId, industry } = req.body;
  const userId = req.user!.userId;

  const baseData = {
    userId,
    title: title || 'New Chat',
    modelId, modelName, agentId, industry,
  };

  const conv = id && isValidUUID(id)
    ? await prisma.conversation.upsert({
        where: { id },
        create: { id, ...baseData },
        update: {}, // idempotent — already exists, return it
      })
    : await prisma.conversation.create({ data: baseData });

  // Defense in depth: if upsert found an existing row owned by another
  // user, don't leak it (UUIDv4 collisions are astronomically unlikely
  // but still — fail closed).
  if (conv.userId !== userId) {
    throw new AppError('Conversation id conflict', 409);
  }

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

// DELETE /api/conversations/:id/messages/from/:messageId
// Time-travel cleanup for edit-and-resend: hard-deletes the named message
// AND every message in the same conversation with createdAt >= the anchor's
// createdAt. Used by the chat client to drop the original user turn and the
// AI response (plus anything after) before regenerating from the edited
// content. Idempotent at the row level — re-running with the same anchor
// just deletes 0 additional rows.
router.delete('/:id/messages/from/:messageId', asyncHandler(async (req: Request, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  const anchor = await prisma.chatMessage.findUnique({ where: { id: req.params.messageId } });
  if (!anchor || anchor.conversationId !== req.params.id) {
    throw new AppError('Message not found in conversation', 404);
  }

  const result = await prisma.chatMessage.deleteMany({
    where: {
      conversationId: req.params.id,
      createdAt: { gte: anchor.createdAt },
    },
  });
  res.json({ success: true, data: { deleted: result.count } });
}));

// POST /api/conversations/:id/messages — Save messages to a conversation
const MAX_MESSAGE_CONTENT_CHARS = 100_000; // ~25K tokens; generous for code/docs
router.post('/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conv) throw new AppError('Conversation not found', 404);
  if (conv.userId !== req.user!.userId) throw new AppError('Unauthorized', 403);

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('messages array is required', 400);
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string' && msg.content.length > MAX_MESSAGE_CONTENT_CHARS) {
      throw new AppError(
        `Message content too large (${msg.content.length} chars, max ${MAX_MESSAGE_CONTENT_CHARS})`,
        413,
      );
    }
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
