import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

// GET /api/agents — list all agents visible to the user (defaults + own + org)
export const listAgents = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, organizationId: true },
  });
  if (!user) throw new AppError('User not found', 404);

  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      OR: [
        { isDefault: true, userId: null },           // platform defaults
        { userId: user.id },                          // user's own
        ...(user.organizationId
          ? [{ organizationId: user.organizationId }] // org-shared
          : []),
      ],
    },
    include: {
      defaultModel: { select: { id: true, name: true, provider: true } },
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return res.json({
    success: true,
    data: agents,
  });
});

// GET /api/agents/:id — get single agent
export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const agent = await prisma.agent.findUnique({
    where: { id: req.params.id },
    include: {
      defaultModel: { select: { id: true, name: true, provider: true } },
    },
  });

  if (!agent) throw new AppError('Agent not found', 404);

  // Check access: default agents are public, otherwise must be owner or same org
  if (!agent.isDefault && agent.userId !== req.user.userId) {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user?.organizationId || user.organizationId !== agent.organizationId) {
      throw new AppError('Not authorized to view this agent', 403);
    }
  }

  return res.json({ success: true, data: agent });
});

// POST /api/agents — create a custom agent (AI employee)
export const createAgent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const {
    name, role, avatar, description, systemPrompt, personality,
    defaultModelId, temperature, maxTokens, topP, industry, shared,
  } = req.body;

  if (!name || !role || !systemPrompt) {
    throw new AppError('name, role, and systemPrompt are required', 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, organizationId: true },
  });
  if (!user) throw new AppError('User not found', 404);

  const agent = await prisma.agent.create({
    data: {
      name,
      role,
      avatar: avatar || '🤖',
      description: description || null,
      systemPrompt,
      personality: personality || 'professional',
      defaultModelId: defaultModelId || null,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2000,
      topP: topP ?? 0.9,
      industry: industry || null,
      isDefault: false,
      userId: user.id,
      organizationId: shared && user.organizationId ? user.organizationId : null,
    },
    include: {
      defaultModel: { select: { id: true, name: true, provider: true } },
    },
  });

  return res.status(201).json({
    success: true,
    message: `${name} has been hired!`,
    data: agent,
  });
});

// PUT /api/agents/:id — update a custom agent
export const updateAgent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Agent not found', 404);

  // Can't edit platform defaults
  if (existing.isDefault && !existing.userId) {
    throw new AppError('Cannot edit platform default agents', 403);
  }

  // Must be the owner
  if (existing.userId !== req.user.userId) {
    throw new AppError('Not authorized to edit this agent', 403);
  }

  const {
    name, role, avatar, description, systemPrompt, personality,
    defaultModelId, temperature, maxTokens, topP, industry, isActive, shared,
  } = req.body;

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { organizationId: true },
  });

  const agent = await prisma.agent.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(avatar !== undefined && { avatar }),
      ...(description !== undefined && { description }),
      ...(systemPrompt !== undefined && { systemPrompt }),
      ...(personality !== undefined && { personality }),
      ...(defaultModelId !== undefined && { defaultModelId: defaultModelId || null }),
      ...(temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { maxTokens }),
      ...(topP !== undefined && { topP }),
      ...(industry !== undefined && { industry: industry || null }),
      ...(isActive !== undefined && { isActive }),
      ...(shared !== undefined && {
        organizationId: shared && user?.organizationId ? user.organizationId : null,
      }),
    },
    include: {
      defaultModel: { select: { id: true, name: true, provider: true } },
    },
  });

  return res.json({
    success: true,
    message: `${agent.name} updated`,
    data: agent,
  });
});

// DELETE /api/agents/:id — fire (delete) a custom agent
export const deleteAgent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError('Agent not found', 404);

  if (existing.isDefault && !existing.userId) {
    throw new AppError('Cannot delete platform default agents', 403);
  }

  if (existing.userId !== req.user.userId) {
    throw new AppError('Not authorized to delete this agent', 403);
  }

  await prisma.agent.delete({ where: { id: req.params.id } });

  return res.json({
    success: true,
    message: `${existing.name} has been let go.`,
  });
});
