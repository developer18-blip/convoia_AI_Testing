import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  createTask,
  getMyTasks,
  getCreatedTasks,
  getTeamTasks,
  updateTaskStatus,
  updateTask,
  addComment,
  deleteTask,
  getTaskDetail,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from '../controllers/taskController.js';

const router = Router();

router.use(authMiddleware);

router.post('/', createTask);
router.get('/my', getMyTasks);
router.get('/created', getCreatedTasks);
router.get('/team', getTeamTasks);
router.get('/:id', getTaskDetail);
router.put('/:id', updateTask);
router.patch('/:id/status', updateTaskStatus);
router.post('/:id/comments', addComment);
router.post('/:id/subtasks', addSubtask);
router.patch('/subtasks/:subtaskId/toggle', toggleSubtask);
router.delete('/subtasks/:subtaskId', deleteSubtask);
router.delete('/:id', deleteTask);

export default router;
