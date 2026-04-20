/**
 * File Generation Service — orchestrates AI-JSON → Python script →
 * {S3 upload OR local disk} → download URL.
 *
 * Resolves the Python scripts at backend/scripts/ (outside the TS
 * source tree, no compilation needed).
 *
 * Storage mode:
 *   - USE_LOCAL_FILE_STORAGE=true  → keep file in TEMP_DIR, serve via
 *     GET /api/files/download/:fileId?token=<jwt>. Files auto-delete
 *     after 1 hour.
 *   - otherwise → upload to S3, return 1-hour pre-signed URL.
 *
 * Billing is handled by the caller in aiController (30% markup).
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

// ESM-friendly __dirname (project is ESM per tsconfig "module": "NodeNext")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Backend root resolves the same way in dev (src/services/…) and
// prod (dist/src/services/…). Scripts live at backend/scripts/ in
// both cases, so one extra `..` covers both.
const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts');
const TEMP_DIR = '/tmp/convoia-files';

const BUCKET = process.env.AWS_S3_BUCKET_FILES || 'convoia-generated-files';
const REGION = process.env.AWS_S3_REGION || process.env.AWS_SES_REGION || 'us-east-1';

const USE_LOCAL_STORAGE = (process.env.USE_LOCAL_FILE_STORAGE || '').toLowerCase() === 'true';
const BACKEND_URL = process.env.BACKEND_URL || 'https://intellect.convoia.com';
const DOWNLOAD_TTL_SECONDS = 3600;

const s3 = buildS3Client();

function buildS3Client(): S3Client {
  // Prefer dedicated S3 credentials if present; otherwise reuse the SES
  // IAM user creds (user will need to attach an S3 policy to that user
  // for production). Falls through to EC2 instance role if neither set.
  const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID || process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY || process.env.AWS_SES_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return new S3Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });
  }
  return new S3Client({ region: REGION });
}

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export interface FileGenerationResult {
  success: boolean;
  downloadUrl?: string;
  fileName?: string;
  fileSize?: number;
  format?: string;
  s3Key?: string;
  error?: string;
}

export async function generateFile(
  format: 'pdf' | 'docx' | 'pptx' | 'xlsx',
  contentJson: object,
  userId: string,
): Promise<FileGenerationResult> {
  const fileId = crypto.randomUUID();
  const safeTitle = getSafeFileName(contentJson, fileId);
  const fileName = `${safeTitle}.${format}`;
  const tempPath = path.join(TEMP_DIR, `${fileId}.${format}`);
  const s3Key = `generated/${userId}/${fileId}.${format}`;

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  try {
    const scriptPath = path.join(SCRIPTS_DIR, `generate_${format}.py`);
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: `Generator script not found at ${scriptPath}` };
    }

    await runPythonScript(scriptPath, tempPath, contentJson);

    if (!fs.existsSync(tempPath)) {
      return { success: false, error: 'File generation did not produce an output file' };
    }
    const stats = fs.statSync(tempPath);
    if (stats.size === 0) {
      try { fs.unlinkSync(tempPath); } catch { /* noop */ }
      return { success: false, error: 'File generation produced an empty file' };
    }

    if (USE_LOCAL_STORAGE) {
      // Local-disk mode — keep the temp file, hand out a JWT-signed URL.
      // Files are cleaned up by the janitor in startLocalCleanup().
      const token = signDownloadToken({ fileId, format, fileName, userId });
      const downloadUrl = `${BACKEND_URL}/api/files/download/${fileId}.${format}?token=${encodeURIComponent(token)}`;
      logger.info(`File generated (local): ${format}, ${stats.size} bytes, id=${fileId}`);
      return {
        success: true,
        downloadUrl,
        fileName,
        fileSize: stats.size,
        format,
      };
    }

    const buffer = fs.readFileSync(tempPath);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: MIME_TYPES[format] || 'application/octet-stream',
      ContentDisposition: `attachment; filename="${fileName}"`,
      Metadata: { userId, format, generatedAt: new Date().toISOString() },
    }));

    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
      }),
      { expiresIn: DOWNLOAD_TTL_SECONDS },
    );

    try { fs.unlinkSync(tempPath); } catch { /* noop */ }

    logger.info(`File generated: ${format}, ${stats.size} bytes, key=${s3Key}`);

    return {
      success: true,
      downloadUrl,
      fileName,
      fileSize: stats.size,
      format,
      s3Key,
    };
  } catch (err: any) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* noop */ }
    logger.error(`File generation failed (${format}): ${err.message}`);
    return { success: false, error: err.message };
  }
}

export async function refreshDownloadUrl(s3Key: string, fileName?: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ResponseContentDisposition: fileName ? `attachment; filename="${fileName}"` : undefined,
    }),
    { expiresIn: 3600 },
  );
}

function runPythonScript(scriptPath: string, outputPath: string, inputJson: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, outputPath], { timeout: 30_000 });

    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Python exited ${code}: ${(stderr || stdout).substring(0, 600)}`));
    });
    proc.on('error', (err) => {
      reject(new Error(`Failed to start python3: ${err.message}`));
    });

    try {
      proc.stdin.write(JSON.stringify(inputJson));
      proc.stdin.end();
    } catch (err: any) {
      reject(new Error(`Failed to pipe JSON to python: ${err.message}`));
    }
  });
}

/** Produce a filesystem-safe name from the content's title, falling back to the id. */
function getSafeFileName(contentJson: any, fallbackId: string): string {
  const rawTitle: string = typeof contentJson?.title === 'string' ? contentJson.title : '';
  const cleaned = rawTitle
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
  return cleaned || `convoia-${fallbackId.substring(0, 8)}`;
}

// ── Local-disk download support ────────────────────────────────────────
// Used only when USE_LOCAL_FILE_STORAGE=true. The token binds the
// download URL to a specific fileId + user + expiry so a leaked link
// can't be replayed after 1 hour or used across users.

export interface DownloadTokenPayload {
  fileId: string;
  format: string;
  fileName: string;
  userId: string;
}

function signDownloadToken(payload: DownloadTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: DOWNLOAD_TTL_SECONDS });
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as DownloadTokenPayload & {
      iat?: number; exp?: number;
    };
    if (!decoded?.fileId || !decoded?.format || !decoded?.fileName) return null;
    return { fileId: decoded.fileId, format: decoded.format, fileName: decoded.fileName, userId: decoded.userId };
  } catch {
    return null;
  }
}

/** Absolute path to a local-stored file. */
export function localFilePath(fileId: string, format: string): string {
  return path.join(TEMP_DIR, `${fileId}.${format}`);
}

export function mimeTypeFor(format: string): string {
  return MIME_TYPES[format] || 'application/octet-stream';
}

export const isLocalStorageMode = USE_LOCAL_STORAGE;

/**
 * Start the janitor that deletes local files older than DOWNLOAD_TTL_SECONDS.
 * No-op when S3 mode is active. Safe to call once at server boot.
 */
let cleanupTimer: NodeJS.Timeout | null = null;
export function startLocalCleanup(): void {
  if (!USE_LOCAL_STORAGE || cleanupTimer) return;
  const run = () => {
    try {
      if (!fs.existsSync(TEMP_DIR)) return;
      const cutoff = Date.now() - DOWNLOAD_TTL_SECONDS * 1000;
      for (const entry of fs.readdirSync(TEMP_DIR)) {
        const full = path.join(TEMP_DIR, entry);
        try {
          const st = fs.statSync(full);
          if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full);
        } catch { /* per-file errors are fine — try next */ }
      }
    } catch (err: any) {
      logger.warn(`File-gen cleanup janitor error: ${err.message}`);
    }
  };
  cleanupTimer = setInterval(run, 10 * 60 * 1000);
  // Don't keep the event loop alive just for cleanup
  cleanupTimer.unref?.();
  run();
  logger.info('Local file-gen cleanup janitor started (10 min interval, 1h TTL)');
}
