import { Router, Request, Response } from 'express';
import { queryAI, queryAIStream, compareModels } from '../controllers/aiController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';
import { queryLimiter } from '../middleware/rateLimiter.js';
import { getModelRecommendation } from '../services/modelRecommendationService.js';

const router = Router();

// All AI routes accept JWT or API key authentication
router.use(jwtOrApiKey);

// Smart model recommendation (ZERO token cost — rule-based)
router.post('/recommend', (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) {
    res.json({ success: true, data: null });
    return;
  }
  const recommendation = getModelRecommendation(message);
  res.json({ success: true, data: recommendation });
});

// Query an AI model (standard JSON response)
router.post('/query', queryLimiter, queryAI);

// Query an AI model (SSE streaming response)
router.post('/query/stream', queryLimiter, queryAIStream);

// Compare multiple models
router.post('/compare', queryLimiter, compareModels);

export default router;
