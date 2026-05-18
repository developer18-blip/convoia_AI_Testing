import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';

const NAME_MAX = 80;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function validateName(name: unknown): string {
  if (typeof name !== 'string') throw new AppError('name is required', 400);
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new AppError('name cannot be empty', 400);
  if (trimmed.length > NAME_MAX) throw new AppError(`name max ${NAME_MAX} chars`, 400);
  if (/[\r\n]/.test(trimmed)) throw new AppError('name cannot contain newlines', 400);
  return trimmed;
}

function validateColor(color: unknown): string | null {
  if (color === null) return null;
  if (typeof color !== 'string' || !COLOR_RE.test(color)) {
    throw new AppError('color must be hex like #RRGGBB', 400);
  }
  return color;
}

function validateSortOrder(sortOrder: unknown): number {
  if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new AppError('sortOrder must be a non-negative integer', 400);
  }
  return sortOrder;
}

// GET /api/folders — list current user's folders, oldest sortOrder first
export const listFolders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const folders = await prisma.folder.findMany({
    where: { userId: req.user.userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: folders });
});

// POST /api/folders — create a folder owned by the current user
export const createFolder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const name = validateName(req.body?.name);
  const color = req.body?.color !== undefined ? validateColor(req.body.color) : undefined;
  const sortOrder = req.body?.sortOrder !== undefined ? validateSortOrder(req.body.sortOrder) : undefined;

  const folder = await prisma.folder.create({
    data: {
      userId: req.user.userId,
      name,
      ...(color !== undefined ? { color } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  });
  res.status(201).json({ success: true, data: folder });
});

// PATCH /api/folders/:id — rename / recolor / re-sort. 404 on cross-user
// access (NOT 403) so a probe can't enumerate other users' folder IDs.
export const updateFolder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const existing = await prisma.folder.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });
  if (!existing) throw new AppError('Folder not found', 404);

  const patch: { name?: string; color?: string | null; sortOrder?: number } = {};
  if (req.body?.name !== undefined) patch.name = validateName(req.body.name);
  if (req.body?.color !== undefined) patch.color = validateColor(req.body.color);
  if (req.body?.sortOrder !== undefined) patch.sortOrder = validateSortOrder(req.body.sortOrder);

  if (Object.keys(patch).length === 0) {
    res.json({ success: true, data: existing });
    return;
  }

  const folder = await prisma.folder.update({
    where: { id: existing.id },
    data: patch,
  });
  res.json({ success: true, data: folder });
});

// DELETE /api/folders/:id — DB FK is ON DELETE SET NULL so conversations
// in the folder survive with folderId = null. 404 for cross-user.
export const deleteFolder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const existing = await prisma.folder.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
    select: { id: true },
  });
  if (!existing) throw new AppError('Folder not found', 404);
  await prisma.folder.delete({ where: { id: existing.id } });
  res.json({ success: true });
});
