import { Router } from 'express';
import { register, login, getProfile, updateProfile, changePassword, verifyToken, refreshToken } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public routes
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', authLimiter, refreshToken);

// Protected routes
router.post('/verify', authMiddleware, verifyToken);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/password', authMiddleware, changePassword);

export default router;
