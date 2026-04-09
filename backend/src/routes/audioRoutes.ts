import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  transcribeAudioHandler,
  synthesizeSpeechHandler,
} from '../controllers/audioController.js';

const router = Router();

// Store audio in memory (no disk writes) — 25MB matches Whisper limit
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'audio/webm', 'audio/mp4', 'audio/mpeg',
      'audio/ogg', 'audio/wav', 'audio/x-wav',
      'audio/mp3', 'audio/m4a', 'audio/x-m4a',
      'video/webm', // Chrome records as video/webm for audio-only
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype === 'video/webm') {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

// POST /api/audio/transcribe — Whisper STT
// Accepts: multipart/form-data with 'audio' file field
router.post(
  '/transcribe',
  authMiddleware,
  audioUpload.single('audio'),
  transcribeAudioHandler
);

// POST /api/audio/speak — OpenAI TTS
// Accepts: JSON { text: string, voice?: string }
// Returns: MP3 audio stream
router.post(
  '/speak',
  authMiddleware,
  synthesizeSpeechHandler
);

export default router;
