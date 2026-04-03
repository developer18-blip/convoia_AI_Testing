/**
 * Media Generation Service — AI Video Generation via Google Veo API
 *
 * Supports:
 * - Text-to-Video (T2V)
 * - Image-to-Video (I2V)
 * - Video-to-Video editing (V2V) — future
 *
 * Pipeline:
 * 1. Detect media type (text / image / video input)
 * 2. Parse user intent (mood, style, camera, motion)
 * 3. Enhance prompt (cinematic transformation)
 * 4. Call Veo API (long-running operation → poll for result)
 * 5. Return video URL
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../config/logger.js';

// ── Types ────────────────────────────────────────────────────────────

export type MediaType = 'text-to-video' | 'image-to-video' | 'video-to-video';

export interface MediaRequest {
  prompt: string;
  mediaType: MediaType;
  inputImageBase64?: string;
  inputImageMimeType?: string;
  userId: string;
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: 5 | 6 | 7 | 8;
}

export interface VideoEnhancement {
  mood?: string;
  style?: string;
  camera?: string;
  lighting?: string;
  motion?: string;
  audio?: string;
  pacing?: string;
}

export interface VideoResult {
  videoUrl: string;
  revisedPrompt: string;
  provider: string;
  durationSeconds: number;
  enhancementsApplied: string[];
}

// ── Step 1: Input Detection ──────────────────────────────────────────

const VIDEO_INTENT_PATTERNS = [
  // Direct: "generate/create a video/clip/animation"
  /\b(gen[ea]r[ea]te|create|make|produce|render)\s+(a\s+)?(video|clip|animation|motion|footage)\b/i,
  // "video of X", "footage of X"
  /\b(video|clip|animation|footage)\s+(of|about|showing|with|featuring)\b/i,
  // Motion keywords
  /\b(animate|bring to life|make it move|add motion)\b/i,
  // Explicit: "text to video", "t2v"
  /\b(text.to.video|t2v)\b/i,
  // "create/generate a cinematic sequence/scene/shot" (core fix — catches "cinematic" + action verb)
  /\b(gen[ea]r[ea]te|create|make|produce)\s+(a\s+)?(cinematic|movie|film)\s*(sequence|scene|shot|clip|video|footage)?\b/i,
  // Standalone cinematic production terms
  /\b(cinematic\s+(sequence|scene|shot|footage)|movie\s+scene|short\s+film)\b/i,
  // Conversion: "turn X into video"
  /\b(turn|convert|transform)\s+.*(into|to|as)\s+(a\s+)?(video|animation|clip)\b/i,
  // Motion effects + video context
  /\b(slow\s*motion|time\s*lapse|timelapse)\s+(video|of|clip|sequence)\b/i,
  // "generate a ... sequence" with production keywords
  /\b(gen[ea]r[ea]te|create)\b.*\b(sequence|scene)\b.*\b(tracking|camera|lighting|4k|cinematic)\b/i,
];

const VIDEO_ANTI_PATTERNS = [
  /\b(analyze|explain|describe|summarize|review|compare)\s+(this\s+)?video\b/i,
  /\b(what('?s| is) (in|happening|shown))\b/i,
  /\b(transcribe|caption|subtitle)\b/i,
];

/**
 * Detect if the user wants to GENERATE a video (not analyze one).
 */
export function detectVideoIntent(
  message: string,
  hasImageAttachment: boolean,
  _conversationContext?: Array<{ role: string; content: string }>
): { isVideoRequest: boolean; confidence: 'high' | 'medium' | 'low'; mediaType: MediaType; extractedSubject: string } {
  const lower = message.toLowerCase();

  // Anti-patterns: user is asking about a video, not generating one
  if (VIDEO_ANTI_PATTERNS.some(p => p.test(message))) {
    return { isVideoRequest: false, confidence: 'low', mediaType: 'text-to-video', extractedSubject: '' };
  }

  // Check direct video generation patterns
  for (const pattern of VIDEO_INTENT_PATTERNS) {
    if (pattern.test(message)) {
      // Extract subject — strip ALL intent/production keywords to get the core description
      let subject = message
        .replace(/\b(gen[ea]r[ea]te|create|make|produce|render|animate)\s+(a\s+)?(cinematic\s+)?(video|clip|animation|motion|footage|sequence|scene|shot)\s*(of|about|showing|with|featuring)?\s*/i, '')
        .replace(/\b(text.to.video|t2v)\s*/i, '')
        .replace(/,?\s*captured with\b.*$/i, '') // strip production instructions (they'll be auto-added by enhancer)
        .replace(/,?\s*(photorealistic|4k|professional|cinematic)\s*(quality|resolution|color grading|lighting|natural lighting)?\s*/gi, '')
        .trim();
      if (!subject || subject.length < 5) subject = message; // fallback to original if over-stripped

      const mediaType: MediaType = hasImageAttachment ? 'image-to-video' : 'text-to-video';
      return { isVideoRequest: true, confidence: 'high', mediaType, extractedSubject: subject };
    }
  }

  // If image attached + motion keywords → image-to-video
  if (hasImageAttachment && /\b(animate|motion|move|bring to life|make.*move|video)\b/i.test(lower)) {
    return { isVideoRequest: true, confidence: 'medium', mediaType: 'image-to-video', extractedSubject: message };
  }

  return { isVideoRequest: false, confidence: 'low', mediaType: 'text-to-video', extractedSubject: '' };
}

// ── Step 2: Intent + Semantic Parsing ────────────────────────────────

/**
 * Extract structured cinematic intent from the user's prompt.
 * NLP-style keyword extraction — no ML needed.
 */
export function parseVideoIntent(prompt: string): VideoEnhancement {
  const lower = prompt.toLowerCase();
  const enhancement: VideoEnhancement = {};

  // Mood detection
  const MOODS: Record<string, RegExp> = {
    'dramatic': /\b(dramatic|intense|powerful|epic|cinematic)\b/,
    'calm': /\b(calm|peaceful|serene|tranquil|relaxing|gentle)\b/,
    'mysterious': /\b(mysterious|dark|eerie|haunting|suspense)\b/,
    'energetic': /\b(energetic|fast|dynamic|action|exciting|adrenaline)\b/,
    'romantic': /\b(romantic|love|tender|intimate|beautiful)\b/,
    'melancholic': /\b(sad|melancholic|emotional|nostalgic|lonely)\b/,
    'futuristic': /\b(futuristic|sci-?fi|cyberpunk|neon|tech)\b/,
    'joyful': /\b(happy|joyful|fun|playful|cheerful|bright)\b/,
  };
  for (const [mood, pattern] of Object.entries(MOODS)) {
    if (pattern.test(lower)) { enhancement.mood = mood; break; }
  }

  // Style detection
  const STYLES: Record<string, RegExp> = {
    'cinematic': /\b(cinematic|film|movie|hollywood)\b/,
    'documentary': /\b(documentary|realistic|real-?life|raw)\b/,
    'anime': /\b(anime|manga|japanese animation|animated)\b/,
    'vintage': /\b(vintage|retro|old|classic|70s|80s|90s)\b/,
    'minimalist': /\b(minimalist|simple|clean|modern)\b/,
    'fantasy': /\b(fantasy|magical|enchanted|fairy|mythical)\b/,
    'noir': /\b(noir|black and white|monochrome|detective)\b/,
  };
  for (const [style, pattern] of Object.entries(STYLES)) {
    if (pattern.test(lower)) { enhancement.style = style; break; }
  }

  // Camera
  if (/\b(drone|aerial|bird'?s?\s*eye)\b/.test(lower)) enhancement.camera = 'aerial drone shot';
  else if (/\b(close-?up|macro|detail)\b/.test(lower)) enhancement.camera = 'close-up shot';
  else if (/\b(wide|panoramic|landscape|establishing)\b/.test(lower)) enhancement.camera = 'wide establishing shot';
  else if (/\b(tracking|follow|chase)\b/.test(lower)) enhancement.camera = 'dynamic tracking shot';
  else if (/\b(pov|first.person|point.of.view)\b/.test(lower)) enhancement.camera = 'POV first-person shot';
  else if (/\b(orbit|360|revolve|rotate around)\b/.test(lower)) enhancement.camera = 'orbiting camera';

  // Lighting
  if (/\b(golden\s*hour|sunset|sunrise|warm)\b/.test(lower)) enhancement.lighting = 'golden hour warm lighting';
  else if (/\b(neon|glow|cyberpunk|electric)\b/.test(lower)) enhancement.lighting = 'neon glow lighting';
  else if (/\b(dramatic|contrast|shadow|chiaroscuro)\b/.test(lower)) enhancement.lighting = 'dramatic high-contrast lighting';
  else if (/\b(soft|diffuse|gentle|natural)\b/.test(lower)) enhancement.lighting = 'soft natural diffused lighting';
  else if (/\b(dark|moody|low.key|dim)\b/.test(lower)) enhancement.lighting = 'low-key moody lighting';
  else if (/\b(studio|professional|bright)\b/.test(lower)) enhancement.lighting = 'professional studio lighting';

  // Motion
  if (/\b(slow\s*mo|slow\s*motion|slowed)\b/.test(lower)) enhancement.motion = 'slow motion';
  else if (/\b(time\s*lapse|timelapse|sped up|fast forward)\b/.test(lower)) enhancement.motion = 'time-lapse';
  else if (/\b(hyper\s*lapse|hyperlapse)\b/.test(lower)) enhancement.motion = 'hyperlapse';
  else if (/\b(smooth|fluid|flowing|glide)\b/.test(lower)) enhancement.motion = 'smooth fluid motion';
  else if (/\b(dynamic|fast|rapid|quick|energetic)\b/.test(lower)) enhancement.motion = 'dynamic fast-paced movement';

  // Audio cues
  if (/\b(music|score|soundtrack|background\s*music)\b/.test(lower)) enhancement.audio = 'cinematic background music';
  if (/\b(intense|dramatic|epic)\b/.test(lower) && !enhancement.audio) enhancement.audio = 'intense cinematic score';
  if (/\b(ambient|nature|environment)\b/.test(lower)) enhancement.audio = 'ambient environmental sounds';
  if (/\b(silence|quiet|no\s*sound|mute)\b/.test(lower)) enhancement.audio = 'silence';

  // Pacing
  if (/\b(fast|quick|rapid|upbeat)\b/.test(lower)) enhancement.pacing = 'fast-paced';
  else if (/\b(slow|gentle|gradual|contemplative)\b/.test(lower)) enhancement.pacing = 'slow contemplative';
  else if (/\b(build|crescendo|escalat)\b/.test(lower)) enhancement.pacing = 'building crescendo';

  return enhancement;
}

// ── Step 3: Prompt Enhancement Engine ────────────────────────────────

/**
 * Transform a simple prompt into a cinematic, production-quality prompt.
 * Always enhances — even if user didn't specify style details.
 */
export function enhanceVideoPrompt(subject: string, intent: VideoEnhancement): string {
  const parts: string[] = [];

  // Core subject
  parts.push(`A ${intent.style || 'cinematic'} sequence of ${subject}`);

  // Camera
  if (intent.camera) {
    parts.push(`captured with ${intent.camera}`);
  } else {
    // Auto-select camera based on subject
    if (/\b(landscape|mountain|ocean|city|skyline)\b/i.test(subject)) {
      parts.push('captured with sweeping aerial drone cinematography');
    } else if (/\b(person|face|portrait|eyes)\b/i.test(subject)) {
      parts.push('captured with intimate close-up framing');
    } else if (/\b(car|vehicle|race|chase|running|sport)\b/i.test(subject)) {
      parts.push('captured with dynamic tracking shots');
    } else {
      parts.push('captured with smooth cinematic camera movements');
    }
  }

  // Motion
  if (intent.motion) {
    parts.push(`${intent.motion} effects`);
  }

  // Lighting
  if (intent.lighting) {
    parts.push(intent.lighting);
  } else if (intent.mood) {
    // Infer lighting from mood
    const moodLighting: Record<string, string> = {
      'dramatic': 'dramatic high-contrast lighting with deep shadows',
      'calm': 'soft natural golden hour light',
      'mysterious': 'moody atmospheric low-key lighting',
      'energetic': 'vibrant dynamic lighting',
      'romantic': 'warm soft diffused candlelight glow',
      'futuristic': 'cold blue neon lighting with lens flares',
      'joyful': 'bright sun-drenched natural light',
    };
    parts.push(moodLighting[intent.mood] || 'cinematic natural lighting');
  } else {
    parts.push('cinematic natural lighting');
  }

  // Scene richness — add environmental details
  if (/\b(rain|storm|thunder)\b/i.test(subject)) parts.push('rain droplets visible in the air, wet reflections on surfaces');
  else if (/\b(snow|winter|cold)\b/i.test(subject)) parts.push('snow particles floating in the air, frost on surfaces');
  else if (/\b(fire|flame|burn)\b/i.test(subject)) parts.push('sparks and embers floating upward, warm color grading');
  else if (/\b(ocean|sea|water|wave)\b/i.test(subject)) parts.push('light refracting through water, spray particles in the air');
  else if (/\b(forest|tree|nature|jungle)\b/i.test(subject)) parts.push('volumetric light rays through foliage, particles in the air');
  else if (/\b(city|urban|street|night)\b/i.test(subject)) parts.push('atmospheric haze, reflections on wet pavement');

  // Audio cues (for prompt enrichment — Veo doesn't generate audio but prompt context helps)
  if (intent.audio && intent.audio !== 'silence') {
    parts.push(`evoking ${intent.audio}`);
  }

  // Pacing
  if (intent.pacing) {
    parts.push(`${intent.pacing} pacing`);
  }

  // Quality boosters
  parts.push('photorealistic quality, 4K resolution, professional color grading');

  return parts.join(', ') + '.';
}

// ── Step 4: Veo API Integration ──────────────────────────────────────

function getGoogleKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured.');
  return key;
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'videos');

function saveVideoToDisk(data: Buffer, ext = 'mp4'): string {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return `/api/uploads/videos/${filename}`;
}

/**
 * Generate video using Google Veo 2 API.
 *
 * Flow:
 * 1. Submit generateVideos request → get operation ID
 * 2. Poll operation until done (5-10s intervals, up to 5 minutes)
 * 3. Download video → save to disk → return URL
 */
export async function generateVideo(
  request: MediaRequest,
  onProgress?: (status: string) => void,
): Promise<VideoResult> {
  const apiKey = getGoogleKey();
  const model = 'veo-2.0-generate-001';
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  // Parse intent and enhance prompt
  const intent = parseVideoIntent(request.prompt);
  const enhancedPrompt = enhanceVideoPrompt(request.prompt, intent);
  const enhancementsApplied: string[] = [];

  if (intent.mood) enhancementsApplied.push(`mood: ${intent.mood}`);
  if (intent.camera) enhancementsApplied.push(`camera: ${intent.camera}`);
  if (intent.lighting) enhancementsApplied.push(`lighting: ${intent.lighting}`);
  if (intent.motion) enhancementsApplied.push(`motion: ${intent.motion}`);
  if (enhancementsApplied.length === 0) enhancementsApplied.push('auto: cinematic camera, natural lighting, professional grading');

  logger.info(`Veo request: type=${request.mediaType}, enhanced="${enhancedPrompt.substring(0, 120)}..."`);
  onProgress?.('Enhancing cinematic details...');

  // Build request body — Veo uses predictLongRunning with instances[] + parameters{}
  const instance: Record<string, any> = { prompt: enhancedPrompt };

  // Image-to-video: include reference image
  if (request.mediaType === 'image-to-video' && request.inputImageBase64) {
    instance.image = { bytesBase64Encoded: request.inputImageBase64, mimeType: request.inputImageMimeType || 'image/jpeg' };
  }

  const generateBody = {
    instances: [instance],
    parameters: {
      sampleCount: 1,
      aspectRatio: request.aspectRatio || '16:9',
      personGeneration: 'allow_adult',
      durationSeconds: request.durationSeconds || 8,
    },
  };

  // Step 1: Submit generation request (predictLongRunning)
  onProgress?.('Generating video...');
  const submitRes = await axios.post(
    `${baseUrl}/models/${model}:predictLongRunning`,
    generateBody,
    { params: { key: apiKey }, timeout: 30000 }
  );

  const operationName = submitRes.data?.name;
  if (!operationName) {
    throw new Error('Veo API did not return an operation ID');
  }

  logger.info(`Veo operation started: ${operationName}`);

  // Step 2: Poll for completion (max 5 minutes, check every 10 seconds)
  const MAX_POLLS = 30;
  const POLL_INTERVAL = 10000;
  let result: any = null;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const elapsed = ((i + 1) * POLL_INTERVAL / 1000);
    onProgress?.(`Generating video... (${elapsed}s)`);

    try {
      const pollRes = await axios.get(
        `${baseUrl}/${operationName}`,
        { params: { key: apiKey }, timeout: 15000 }
      );

      if (pollRes.data?.done) {
        result = pollRes.data.response || pollRes.data.result;
        break;
      }
    } catch (pollErr: any) {
      logger.warn(`Veo poll attempt ${i + 1} failed: ${pollErr.message}`);
    }
  }

  if (!result) {
    throw new Error('Video generation timed out after 5 minutes');
  }

  // Step 3: Extract video data
  // Response format: { generateVideoResponse: { generatedSamples: [{ video: { uri } }] } }
  const videoResponse = result?.generateVideoResponse || result;
  const generatedVideo = videoResponse?.generatedSamples?.[0]?.video
    || videoResponse?.generatedVideos?.[0]?.video
    || result?.generatedSamples?.[0]?.video;

  if (!generatedVideo) {
    logger.error(`Veo response structure: ${JSON.stringify(result).substring(0, 300)}`);
    throw new Error('Veo API returned no video data');
  }

  // Save video to disk
  onProgress?.('Saving video...');
  let videoUrl: string;

  if (generatedVideo.uri) {
    // Veo returns a download URI that requires the API key
    const downloadUrl = generatedVideo.uri.includes('?')
      ? `${generatedVideo.uri}&key=${apiKey}`
      : `${generatedVideo.uri}?key=${apiKey}`;
    logger.info(`Downloading video from: ${generatedVideo.uri.substring(0, 80)}...`);
    const downloadRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 120000 });
    videoUrl = saveVideoToDisk(Buffer.from(downloadRes.data));
    logger.info(`Video saved: ${videoUrl} (${(downloadRes.data.length / 1024 / 1024).toFixed(1)}MB)`);
  } else if (generatedVideo.videoBytes || generatedVideo.bytesBase64Encoded) {
    const base64 = generatedVideo.videoBytes || generatedVideo.bytesBase64Encoded;
    videoUrl = saveVideoToDisk(Buffer.from(base64, 'base64'));
  } else {
    throw new Error('Veo API returned unrecognized video format');
  }

  logger.info(`Veo video generated: ${videoUrl} for user ${request.userId}`);

  return {
    videoUrl,
    revisedPrompt: enhancedPrompt,
    provider: 'google-veo',
    durationSeconds: request.durationSeconds || 8,
    enhancementsApplied,
  };
}

// ── Token Cost ───────────────────────────────────────────────────────

export const VIDEO_TOKEN_COST = 5000; // ~5x image generation cost
