import { Router } from 'express';
import { executePythonHandler } from '../controllers/sandboxController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';
import { queryLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Auth: JWT or API key, same as /api/ai routes.
router.use(jwtOrApiKey);

// queryLimiter = 30/min/user — matches /api/ai/query. Concurrency
// cap (1-per-user) is enforced inside the controller.
router.post('/execute-python', queryLimiter, executePythonHandler);

export default router;
