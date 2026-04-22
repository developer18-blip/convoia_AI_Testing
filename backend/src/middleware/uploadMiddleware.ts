import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

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
    const unique = Date.now() + '-' + crypto.randomBytes(8).toString('hex')
    cb(null, unique + path.extname(file.originalname))
  },
})

// File filter — accepts by mime type OR by extension (code files in
// particular arrive with inconsistent mime types across browsers).
const ALLOWED_MIMES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  // Spreadsheets (Phase 2)
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  // Structured data (Phase 2)
  'application/json',
  'application/x-yaml',
  'text/yaml',
  'text/x-yaml',
  'application/xml',
  'text/xml',
  // Code — whichever mime the browser decides to send (Phase 2)
  'application/javascript',
  'text/javascript',
  'application/typescript',
  'text/typescript',
  'application/x-typescript',
  'text/x-python',
  'application/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-csrc',
  'text/x-c++src',
  'text/x-shellscript',
  'application/x-sh',
  'application/sql',
  'text/css',
  'text/html',
  // Audio
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/x-m4a',
  // Video
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/mp2t',
])

// Extension allowlist catches the cases where the browser sends
// application/octet-stream or text/plain for a code file.
const ALLOWED_EXTS = new Set([
  '.txt', '.md', '.markdown',
  '.pdf', '.doc', '.docx',
  '.xls', '.xlsx', '.csv',
  '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.env',
  '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.java', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp',
  '.go', '.rs', '.rb', '.php', '.sh', '.bash', '.zsh',
  '.sql', '.html', '.htm', '.css', '.scss', '.less',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.mp3', '.wav', '.m4a', '.ogg', '.webm',
  '.mp4', '.mov', '.avi', '.mkv',
])

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIMES.has(file.mimetype)) return cb(null, true)
  const ext = path.extname(file.originalname).toLowerCase()
  if (ALLOWED_EXTS.has(ext)) return cb(null, true)
  cb(new Error(`File type ${file.mimetype || ext || 'unknown'} not supported`))
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
