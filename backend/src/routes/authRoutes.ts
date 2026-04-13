import { Router } from 'express';
import { register, login, getProfile, updateProfile, changePassword, verifyToken, refreshToken, googleAuth, googleMobileRedirect, googleCallback, verifyEmail, resendVerification, uploadAvatar, selectAvatar, forgotPassword, resetPassword } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

import { uploadSingle } from '../middleware/uploadMiddleware.js';

const router = Router();

// Public routes — authLimiter (20 attempts / 15min per IP) protects
// against brute-force credential stuffing and OTP enumeration.
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/verify-email', authLimiter, verifyEmail);
router.post('/resend-verification', authLimiter, resendVerification);
router.post('/google', authLimiter, googleAuth);
router.get('/google/mobile', googleMobileRedirect);
router.get('/google/callback', googleCallback);
router.post('/refresh', authLimiter, refreshToken);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

// Protected routes
router.post('/verify', authMiddleware, verifyToken);
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/avatar/upload', authMiddleware, uploadSingle, uploadAvatar);
router.post('/avatar/select', authMiddleware, selectAvatar);
router.put('/password', authMiddleware, changePassword);

export default router;
