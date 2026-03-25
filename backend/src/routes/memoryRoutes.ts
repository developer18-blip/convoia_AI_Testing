import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { listMemories, deleteMemory } from '../services/userMemoryService.js';
import { storeMemory } from '../services/vectorMemoryService.js';

const router = Router();
router.use(authMiddleware);

// GET /api/memory — List all memories for current user
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const memories = await listMemories(req.user!.userId);
  res.json({ success: true, data: memories });
}));

// POST /api/memory — Manually add a memory
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { content, category } = req.body;
  if (!content) { res.status(400).json({ success: false, message: 'content is required' }); return; }
  await storeMemory(req.user!.userId, content, category || 'fact', 0.85);
  res.json({ success: true, message: 'Memory saved' });
}));

// DELETE /api/memory/:key — Delete a specific memory
router.delete('/:key', asyncHandler(async (req: Request, res: Response) => {
  const deleted = await deleteMemory(req.user!.userId, req.params.key);
  res.json({ success: true, deleted });
}));

export default router;
