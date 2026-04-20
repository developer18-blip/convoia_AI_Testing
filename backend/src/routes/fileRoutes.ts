import { Router, type Request, type Response } from 'express'
import * as fs from 'fs'
import { processFile, generateImage } from '../controllers/fileController.js'
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js'
import { uploadSingle } from '../middleware/uploadMiddleware.js'
import {
  verifyDownloadToken,
  localFilePath,
  mimeTypeFor,
  isLocalStorageMode,
} from '../services/fileGenerationService.js'

const router = Router()

// Public download route (auth is carried in the ?token= query param,
// not the Authorization header) — mounted BEFORE jwtOrApiKey so a
// browser <a href> click works without needing a bearer token.
router.get('/download/:fileId', (req: Request, res: Response) => {
  if (!isLocalStorageMode) {
    res.status(404).json({ error: 'Local download not enabled' })
    return
  }

  const token = typeof req.query.token === 'string' ? req.query.token : ''
  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return
  }

  const payload = verifyDownloadToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // URL fileId is "<uuid>.<format>"; token encodes them separately.
  // Cross-check so a token for file A can't be used to download file B.
  const expectedPathId = `${payload.fileId}.${payload.format}`
  if (req.params.fileId !== expectedPathId) {
    res.status(403).json({ error: 'Token does not match file' })
    return
  }

  const filePath = localFilePath(payload.fileId, payload.format)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File expired or no longer available' })
    return
  }

  res.setHeader('Content-Type', mimeTypeFor(payload.format))
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${payload.fileName.replace(/"/g, '')}"`
  )
  fs.createReadStream(filePath).pipe(res)
})

router.use(jwtOrApiKey)

// Upload and process file
router.post('/upload', uploadSingle, processFile)

// Generate image
router.post('/generate-image', generateImage)

export default router
