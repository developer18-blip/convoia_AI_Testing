import { Router } from 'express'
import { processFile, generateImage } from '../controllers/fileController.js'
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js'
import { uploadSingle } from '../middleware/uploadMiddleware.js'

const router = Router()
router.use(jwtOrApiKey)

// Upload and process file
router.post('/upload', uploadSingle, processFile)

// Generate image
router.post('/generate-image', generateImage)

export default router
