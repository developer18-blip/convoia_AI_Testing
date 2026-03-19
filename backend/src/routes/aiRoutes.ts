import { Router } from 'express';
import { queryAI, compareModels } from '../controllers/aiController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';
import { queryLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All AI routes accept JWT or API key authentication
router.use(jwtOrApiKey);

// Query an AI model
router.post('/query', queryLimiter, queryAI);

// Compare multiple models
router.post('/compare', queryLimiter, compareModels);

export default router;
