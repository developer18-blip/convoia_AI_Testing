/**
 * Agent Tool Routes — Project workspaces, file browsing, and memory management
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import prisma from '../config/db.js';
import * as fs from 'fs';
import * as path from 'path';
import { getAgentMemory, setMemory, deleteMemory } from '../services/agentMemoryService.js';
import { fileList } from '../services/agentTools.js';

const router = Router();
const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE_ROOT || '/tmp/convoia-workspaces';

// All routes require auth
router.use(authMiddleware);

// ── Project Workspaces ───────────────────────────────────────────────

// POST /api/agent-tools/:agentId/projects — Create project workspace
router.post('/:agentId/projects', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { name, techStack } = req.body;
  if (!name || typeof name !== 'string') throw new AppError('Project name is required', 400);

  const project = await prisma.agentProject.upsert({
    where: { userId_agentId_name: { userId: req.user.userId, agentId: req.params.agentId, name } },
    update: { techStack: techStack || [] },
    create: {
      userId: req.user.userId,
      agentId: req.params.agentId,
      name,
      techStack: techStack || [],
    },
  });

  // Create workspace directory
  const workspacePath = path.join(WORKSPACE_ROOT, req.user.userId, project.id);
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  res.status(201).json({ success: true, data: project });
}));

// GET /api/agent-tools/:agentId/projects — List projects
router.get('/:agentId/projects', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const projects = await prisma.agentProject.findMany({
    where: { userId: req.user.userId, agentId: req.params.agentId },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ success: true, data: projects });
}));

// GET /api/agent-tools/:agentId/projects/:id/files — Browse workspace files
router.get('/:agentId/projects/:id/files', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const project = await prisma.agentProject.findUnique({ where: { id: req.params.id } });
  if (!project || project.userId !== req.user.userId) throw new AppError('Project not found', 404);

  const dir = (req.query.dir as string) || '.';
  const result = await fileList(req.user.userId, project.id, dir);

  res.json({ success: true, data: result.output || [] });
}));

// DELETE /api/agent-tools/:agentId/projects/:id — Delete project workspace
router.delete('/:agentId/projects/:id', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const project = await prisma.agentProject.findUnique({ where: { id: req.params.id } });
  if (!project || project.userId !== req.user.userId) throw new AppError('Project not found', 404);

  // Delete workspace directory
  const workspacePath = path.join(WORKSPACE_ROOT, req.user.userId, project.id);
  if (fs.existsSync(workspacePath)) {
    fs.rmSync(workspacePath, { recursive: true });
  }

  await prisma.agentProject.delete({ where: { id: req.params.id } });

  res.json({ success: true, message: 'Project deleted' });
}));

// ── Agent Memory ─────────────────────────────────────────────────────

// GET /api/agent-tools/:agentId/memory — Get agent memory for user
router.get('/:agentId/memory', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const memory = await getAgentMemory(req.user.userId, req.params.agentId);
  res.json({ success: true, data: memory });
}));

// PUT /api/agent-tools/:agentId/memory — Update memory manually
router.put('/:agentId/memory', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { type, key, value } = req.body;
  if (!type || !key) throw new AppError('type and key are required', 400);

  await setMemory(req.user.userId, req.params.agentId, type, key, value);
  res.json({ success: true, message: 'Memory updated' });
}));

// DELETE /api/agent-tools/:agentId/memory/:key — Delete memory entry
router.delete('/:agentId/memory/:key', asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const type = (req.query.type as string) || 'user_preference';
  await deleteMemory(req.user.userId, req.params.agentId, type, req.params.key);
  res.json({ success: true, message: 'Memory deleted' });
}));

export default router;
