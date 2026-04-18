/**
 * File Generation Service — orchestrates AI-JSON → Python script →
 * S3 upload → pre-signed download URL.
 *
 * Resolves the Python scripts at backend/scripts/ (outside the TS
 * source tree, no compilation needed).
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
      { expiresIn: 3600 },
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
