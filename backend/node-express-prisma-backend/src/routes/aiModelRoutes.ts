import { Router } from 'express';
import { AIModelController } from '../controllers/aiModelController';

const router = Router();
const aiModelController = new AIModelController();

router.post('/', aiModelController.createModel.bind(aiModelController));
router.get('/:id', aiModelController.getModel.bind(aiModelController));
router.put('/:id', aiModelController.updateModel.bind(aiModelController));
router.delete('/:id', aiModelController.deleteModel.bind(aiModelController));

export default router;