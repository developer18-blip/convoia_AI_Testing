import { Router } from 'express';
import { OrganizationController } from '../controllers/organizationController';

const router = Router();
const organizationController = new OrganizationController();

router.post('/', organizationController.createOrganization);
router.get('/:id', organizationController.getOrganization);
router.put('/:id', organizationController.updateOrganization);
router.delete('/:id', organizationController.deleteOrganization);

export default router;