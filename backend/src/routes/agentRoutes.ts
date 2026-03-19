import { Router } from 'express';
import { listAgents, getAgent, createAgent, updateAgent, deleteAgent } from '../controllers/agentController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();

router.use(jwtOrApiKey);

router.get('/', listAgents);
router.get('/:id', getAgent);
router.post('/', createAgent);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

export default router;
