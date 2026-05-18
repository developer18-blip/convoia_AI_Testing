import { Router } from 'express';
import {
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from '../controllers/folderController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/', listFolders);
router.post('/', createFolder);
router.patch('/:id', updateFolder);
router.delete('/:id', deleteFolder);

export default router;
