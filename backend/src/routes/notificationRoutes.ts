import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from '../controllers/notificationController.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get notifications
router.get('/', getNotifications);

// Get unread count (for bell badge)
router.get('/count', getUnreadCount);

// Mark all as read (must be before :id routes)
router.patch('/read-all', markAllAsRead);

// Mark single as read
router.patch('/:id/read', markAsRead);

// Delete notification
router.delete('/:id', deleteNotification);

export default router;
