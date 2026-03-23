import { Router } from 'express';
import { queryAI, queryAIStream, compareModels } from '../controllers/aiController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';
import { queryLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// All AI routes accept JWT or API key authentication
router.use(jwtOrApiKey);

// Query an AI model (standard JSON response)
router.post('/query', queryLimiter, queryAI);

// Query an AI model (SSE streaming response)
router.post('/query/stream', queryLimiter, queryAIStream);

// Compare multiple models
router.post('/compare', queryLimiter, compareModels);

export default router;
