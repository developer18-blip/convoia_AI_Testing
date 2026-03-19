import multer from 'multer'
import path from 'path'
import fs from 'fs'

// Create uploads directory if not exists
const uploadDir = 'uploads/temp'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  },
})

// File filter
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowed = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    // Video
    'video/mp4',
    'video/webm',
    'video/ogg',
  ]

  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`File type ${file.mimetype} not supported`))
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max
  },
})

export const uploadSingle = upload.single('file')
export const uploadMultiple = upload.array('files', 5)
