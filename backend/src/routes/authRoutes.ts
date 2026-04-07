import { Router } from 'express';
import { register, login, getProfile, updateProfile, changePassword, verifyToken, refreshToken, googleAuth, googleMobileRedirect, googleCallback, verifyEmail, resendVerification, uploadAvatar, selectAvatar, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

import { uploadSingle } from '../middleware/uploadMiddleware.js';

const router = Router();

// Public routes (no rate limiting — handled by Nginx in production)
router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/google', googleAuth);
router.get('/google/mobile', googleMobileRedirect);
router.get('/google/callback', googleCallback);
router.post('/refresh', refreshToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.post('/verify', authMiddleware, verifyToken);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/avatar/upload', authMiddleware, uploadSingle, uploadAvatar);
router.post('/avatar/select', authMiddleware, selectAvatar);
router.put('/password', authMiddleware, changePassword);

export default router;
