import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  createTask,
  getMyTasks,
  getCreatedTasks,
  getTeamTasks,
  updateTaskStatus,
  addComment,
  deleteTask,
} from '../controllers/taskController.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Create a task
router.post('/', createTask);

// Get tasks assigned to me
router.get('/my', getMyTasks);

// Get tasks I created
router.get('/created', getCreatedTasks);

// Get team tasks (manager/org_owner)
router.get('/team', getTeamTasks);

// Update task status
router.patch('/:id/status', updateTaskStatus);

// Add comment to task
router.post('/:id/comments', addComment);

// Delete task (creator only)
router.delete('/:id', deleteTask);

export default router;
