import { Router } from 'express';
import { register, login, getProfile, updateProfile, changePassword, verifyToken, refreshToken, googleAuth, verifyEmail, resendVerification, uploadAvatar, selectAvatar } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

import { uploadSingle } from '../middleware/uploadMiddleware.js';

const router = Router();

// Public routes (no rate limiting — handled by Nginx in production)
router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/google', googleAuth);
router.post('/refresh', refreshToken);

// Protected routes
router.post('/verify', authMiddleware, verifyToken);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/avatar/upload', authMiddleware, uploadSingle, uploadAvatar);
router.post('/avatar/select', authMiddleware, selectAvatar);
router.put('/password', authMiddleware, changePassword);

export default router;
