import { Router } from 'express';
import { TokenController } from '../controllers/tokenController';

const router = Router();
const tokenController = new TokenController();

router.post('/generate', tokenController.generateToken.bind(tokenController));
router.post('/validate', tokenController.validateToken.bind(tokenController));
router.delete('/revoke', tokenController.revokeToken.bind(tokenController));

export default router;