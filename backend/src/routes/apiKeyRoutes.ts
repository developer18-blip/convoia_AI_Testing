import { Router } from 'express';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
} from '../controllers/apiKeyController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All API key management routes require JWT auth (not API key auth)
router.use(authMiddleware);

// Create a new API key
router.post('/', strictLimiter, createApiKey);

// List all API keys for current user
router.get('/', listApiKeys);

// Revoke an API key
router.delete('/:keyId', revokeApiKey);

// Rotate an API key (deactivate old, create new)
router.post('/:keyId/rotate', strictLimiter, rotateApiKey);

export default router;
