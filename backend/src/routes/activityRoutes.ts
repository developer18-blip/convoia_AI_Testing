import { Router } from 'express';
import { getActivityFeed, getUserActivity } from '../controllers/activityController.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();

router.use(jwtOrApiKey);

router.get('/', getActivityFeed);
router.get('/user/:userId', getUserActivity);

export default router;
