import { Request, Response } from 'express';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { isValidUUID } from '../utils/validators.js';
import { createNotification } from '../utils/notify.js';

// Task access policy: creator, assignee, platform_admin, or
// org_owner/manager in the same org.
async function canAccessTask(
  taskId: string,
  userId: string,
  userRole: string,
  userOrgId: string | null,
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { createdById: true, assignedToId: true, organizationId: true },
  });
  if (!task) return false;
  if (task.createdById === userId) return true;
  if (task.assignedToId === userId) return true;
  if (userRole === 'platform_admin') return true;
  if (
    task.organizationId &&
    task.organizationId === userOrgId &&
    (userRole === 'org_owner' || userRole === 'manager')
  ) {
    return true;
  }
  return false;
}

async function canAccessSubtask(
  subtaskId: string,
  userId: string,
  userRole: string,
  userOrgId: string | null,
): Promise<boolean> {
  const subtask = await prisma.subTask.findUnique({
    where: { id: subtaskId },
    select: { taskId: true },
  });
  if (!subtask) return false;
  return canAccessTask(subtask.taskId, userId, userRole, userOrgId);
}

// ============ 1. POST /api/tasks ============
export const createTask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { title, description, assignedToId, priority, dueDate, suggestedModelId } = req.body;

  if (!title || !title.trim()) throw new AppError('Title is required', 400);
  if (!assignedToId || !isValidUUID(assignedToId)) {
    throw new AppError('Valid assignedToId is required', 400);
  }
  if (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
    throw new AppError('Priority must be low, medium, high, or urgent', 400);
  }

  const creator = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, name: true, role: true, organizationId: true },
  });
  if (!creator || !creator.organizationId) {
    throw new AppError('You must belong to an organization', 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { id: true, organizationId: true, managerId: true },
  });
  if (!target) throw new AppError('Assignee not found', 404);

  // Must be same org
  if (target.organizationId !== creator.organizationId) {
    throw new AppError('Can only assign tasks to users in your organization', 403);
  }

  // Role-based assignment rules
  if (creator.role === 'employee' && assignedToId !== creator.id) {
    throw new AppError('Employees cannot create tasks for others', 403);
  }
  if (creator.role === 'manager' && target.managerId !== creator.id && assignedToId !== creator.id) {
    throw new AppError('Managers can only assign tasks to their direct employees', 403);
  }

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description?.trim() ?? null,
      createdById: creator.id,
      assignedToId,
      organizationId: creator.organizationId,
      priority: priority ?? 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      suggestedModelId: suggestedModelId ?? null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify assignee (unless self-assigned)
  if (assignedToId !== creator.id) {
    await createNotification(
      assignedToId,
      'task_assigned',
      'New task assigned',
      `${creator.name} assigned you: ${title}`,
      task.id,
      'task'
    );
  }

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Task created successfully',
    data: task,
    timestamp: new Date().toISOString(),
  });
});

// ============ 2. GET /api/tasks/my ============
export const getMyTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { status, priority, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = { assignedToId: req.user.userId };
  if (status && ['pending', 'in_progress', 'completed', 'cancelled'].includes(status as string)) {
    where.status = status;
  }
  if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority as string)) {
    where.priority = priority;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        subtasks: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: limitNum,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Tasks retrieved',
    data: {
      tasks,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 3. GET /api/tasks/created ============
export const getCreatedTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { status, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const where: any = { createdById: req.user.userId };
  if (status && ['pending', 'in_progress', 'completed', 'cancelled'].includes(status as string)) {
    where.status = status;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        subtasks: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Created tasks retrieved',
    data: {
      tasks,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 4. GET /api/tasks/team ============
export const getTeamTasks = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  if (!['manager', 'org_owner', 'platform_admin'].includes(req.user.role)) {
    throw new AppError('Insufficient permissions', 403);
  }

  const { status, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  let where: any = {};

  if (req.user.role === 'manager') {
    // Manager sees tasks for their direct employees + own tasks
    const employees = await prisma.user.findMany({
      where: { managerId: req.user.userId },
      select: { id: true },
    });
    const userIds = [req.user.userId, ...employees.map((e) => e.id)];
    where = { OR: [{ assignedToId: { in: userIds } }, { createdById: { in: userIds } }] };
  } else {
    // Org owner sees all in org
    if (!req.user.organizationId) throw new AppError('Organization required', 400);
    where = { organizationId: req.user.organizationId };
  }

  if (status && ['pending', 'in_progress', 'completed', 'cancelled'].includes(status as string)) {
    where.status = status;
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        subtasks: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
    }),
    prisma.task.count({ where }),
  ]);

  res.json({
    success: true,
    statusCode: 200,
    message: 'Team tasks retrieved',
    data: {
      tasks,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    },
    timestamp: new Date().toISOString(),
  });
});

// ============ 5. PATCH /api/tasks/:id/status ============
export const updateTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid task ID', 400);

  const { status } = req.body;
  if (!status || !['in_progress', 'review', 'completed', 'cancelled', 'revision'].includes(status)) {
    throw new AppError('Status must be in_progress, review, completed, cancelled, or revision', 400);
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!task) throw new AppError('Task not found', 404);

  // Only assignee, creator, or admin can update
  const canUpdate =
    task.assignedToId === req.user.userId ||
    task.createdById === req.user.userId ||
    ['org_owner', 'platform_admin'].includes(req.user.role);
  if (!canUpdate) throw new AppError('Not authorized to update this task', 403);

  const updateData: any = { status };
  if (status === 'completed') {
    updateData.completedAt = new Date();
  }

  const updated = await prisma.task.update({
    where: { id },
    data: updateData,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify creator on completion
  if (status === 'completed' && task.createdById !== req.user.userId) {
    await createNotification(
      task.createdById,
      'task_completed',
      'Task completed',
      `${task.assignedTo.name} completed: ${task.title}`,
      task.id,
      'task'
    );
  }

  res.json({
    success: true,
    statusCode: 200,
    message: `Task ${status === 'completed' ? 'completed' : 'updated'}`,
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

// ============ 6. POST /api/tasks/:id/comments ============
export const addComment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid task ID', 400);

  const { content } = req.body;
  if (!content || !content.trim()) throw new AppError('Content is required', 400);

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, title: true, createdById: true, assignedToId: true, organizationId: true },
  });
  if (!task) throw new AppError('Task not found', 404);

  // Must be in the same org to comment
  if (req.user.organizationId !== task.organizationId && req.user.role !== 'platform_admin') {
    throw new AppError('Not authorized to comment on this task', 403);
  }

  const commenter = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { name: true },
  });

  const comment = await prisma.taskComment.create({
    data: {
      taskId: id,
      userId: req.user.userId,
      content: content.trim(),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify creator and assignee (except commenter)
  const notifyUserIds = new Set([task.createdById, task.assignedToId]);
  notifyUserIds.delete(req.user.userId);

  for (const userId of notifyUserIds) {
    await createNotification(
      userId,
      'task_comment',
      'New comment on task',
      `${commenter?.name ?? 'Someone'} commented on: ${task.title}`,
      task.id,
      'task'
    );
  }

  res.status(201).json({
    success: true,
    statusCode: 201,
    message: 'Comment added',
    data: comment,
    timestamp: new Date().toISOString(),
  });
});

// ============ 7. PUT /api/tasks/:id ============
export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid task ID', 400);

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError('Task not found', 404);

  const canUpdate = task.createdById === req.user.userId ||
    ['org_owner', 'platform_admin'].includes(req.user.role);
  if (!canUpdate) throw new AppError('Not authorized', 403);

  const { title, description, priority, dueDate, assignedToId, section } = req.body;
  const data: any = {};
  if (title !== undefined) data.title = title.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (priority !== undefined) data.priority = priority;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (assignedToId !== undefined) data.assignedToId = assignedToId;
  if (section !== undefined) data.section = section || null;

  const updated = await prisma.task.update({
    where: { id },
    data,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      subtasks: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { comments: true } },
    },
  });

  res.json({ success: true, data: updated });
});

// ============ 8. SUBTASK CRUD ============
export const addSubtask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { id } = req.params;
  const { title } = req.body;
  if (!title?.trim()) throw new AppError('Title is required', 400);

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError('Task not found', 404);

  if (!(await canAccessTask(id, req.user.userId, req.user.role, req.user.organizationId ?? null))) {
    throw new AppError('You do not have permission to modify this task', 403);
  }

  const count = await prisma.subTask.count({ where: { taskId: id } });
  const subtask = await prisma.subTask.create({
    data: { taskId: id, title: title.trim(), sortOrder: count },
  });

  res.status(201).json({ success: true, data: subtask });
});

export const toggleSubtask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { subtaskId } = req.params;

  const subtask = await prisma.subTask.findUnique({ where: { id: subtaskId } });
  if (!subtask) throw new AppError('Subtask not found', 404);

  if (!(await canAccessSubtask(subtaskId, req.user.userId, req.user.role, req.user.organizationId ?? null))) {
    throw new AppError('You do not have permission to modify this subtask', 403);
  }

  const updated = await prisma.subTask.update({
    where: { id: subtaskId },
    data: { isCompleted: !subtask.isCompleted },
  });

  res.json({ success: true, data: updated });
});

export const deleteSubtask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { subtaskId } = req.params;

  if (!(await canAccessSubtask(subtaskId, req.user.userId, req.user.role, req.user.organizationId ?? null))) {
    throw new AppError('You do not have permission to delete this subtask', 403);
  }

  await prisma.subTask.delete({ where: { id: subtaskId } });
  res.json({ success: true, message: 'Subtask deleted' });
});

// ============ 9. GET /api/tasks/:id ============
export const getTaskDetail = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid task ID', 400);

  if (!(await canAccessTask(id, req.user.userId, req.user.role, req.user.organizationId ?? null))) {
    throw new AppError('You do not have permission to view this task', 403);
  }

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true, avatar: true } },
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      subtasks: { orderBy: { sortOrder: 'asc' } },
      comments: {
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!task) throw new AppError('Task not found', 404);

  res.json({ success: true, data: task });
});

// ============ 10. DELETE /api/tasks/:id ============
export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { id } = req.params;
  if (!isValidUUID(id)) throw new AppError('Invalid task ID', 400);

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new AppError('Task not found', 404);

  if (task.createdById !== req.user.userId && req.user.role !== 'platform_admin') {
    throw new AppError('Only the task creator can delete it', 403);
  }

  await prisma.task.delete({ where: { id } });

  res.json({
    success: true,
    statusCode: 200,
    message: 'Task deleted',
    timestamp: new Date().toISOString(),
  });
});
