import { Router } from 'express';
import { servePlot } from '../controllers/sandboxPlotController.js';

const router = Router();

// NOTE: no jwtOrApiKey here — auth is carried in the ?token= query param
// so the LLM-emitted markdown `![](api/sandbox/plot/<id>?token=<t>)`
// works inside the chat <img> renderer. Mirrors the public download
// route pattern in fileRoutes.ts.
router.get('/:plotId', servePlot);

export default router;
