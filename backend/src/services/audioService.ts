import axios from 'axios';
import FormData from 'form-data';
import { AppError } from '../middleware/errorHandler.js';
import { TOKEN_BASE_RATE } from '../config/tokenPackages.js';

// ── Whisper pricing ──
// $0.006 per minute, minimum 1 second billed as 1/60th of a minute
const WHISPER_COST_PER_MINUTE = 0.006;
const WHISPER_MARKUP = 1.30; // 30% markup

// ── TTS pricing ──
// tts-1 (standard): $15 per 1M characters
const TTS_COST_PER_MILLION_CHARS = 15.0;
const TTS_MARKUP = 1.30; // 30% markup

/**
 * Calculate wallet token cost for Whisper transcription.
 */
export function calculateWhisperTokenCost(audioDurationSeconds: number): {
  providerCost: number;
  customerPrice: number;
  walletTokens: number;
} {
  const minutes = Math.max(audioDurationSeconds / 60, 1 / 60);
  const providerCost = minutes * WHISPER_COST_PER_MINUTE;
  const customerPrice = providerCost * WHISPER_MARKUP;
  const walletTokens = Math.max(Math.ceil(customerPrice / TOKEN_BASE_RATE), 1);
  return { providerCost, customerPrice, walletTokens };
}

/**
 * Calculate wallet token cost for TTS synthesis.
 */
export function calculateTTSTokenCost(characterCount: number): {
  providerCost: number;
  customerPrice: number;
  walletTokens: number;
} {
  const providerCost = (characterCount / 1_000_000) * TTS_COST_PER_MILLION_CHARS;
  const customerPrice = providerCost * TTS_MARKUP;
  const walletTokens = Math.max(Math.ceil(customerPrice / TOKEN_BASE_RATE), 1);
  return { providerCost, customerPrice, walletTokens };
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * Returns transcript text, duration, and detected language.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  apiKey: string,
  language?: string
): Promise<{
  transcript: string;
  durationSeconds: number;
  language: string;
}> {
  const ext = mimeType.includes('webm') ? 'webm'
    : mimeType.includes('mp4') ? 'mp4'
    : mimeType.includes('ogg') ? 'ogg'
    : mimeType.includes('wav') ? 'wav'
    : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
    : 'webm';

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: `audio.${ext}`,
    contentType: mimeType,
  });
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  if (language) {
    form.append('language', language);
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        timeout: 30000,
      }
    );

    return {
      transcript: response.data.text || '',
      durationSeconds: response.data.duration || 0,
      language: response.data.language || 'unknown',
    };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 400) throw new AppError('Audio format not supported. Please use a standard recording format.', 400);
    if (status === 413) throw new AppError('Audio file too large. Maximum is 25MB.', 400);
    if (status === 401) throw new AppError('OpenAI API key error', 503);
    throw new AppError(err?.response?.data?.error?.message || err.message || 'Transcription failed', 500);
  }
}

/**
 * Synthesize speech using OpenAI TTS API.
 * Returns MP3 audio buffer and character count.
 */
export async function synthesizeSpeech(
  text: string,
  apiKey: string,
  voice: 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer' = 'nova'
): Promise<{
  audioBuffer: Buffer;
  characterCount: number;
}> {
  const truncated = text.slice(0, 4096);
  const characterCount = truncated.length;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/speech',
      {
        model: 'tts-1',
        input: truncated,
        voice,
        response_format: 'mp3',
        speed: 1.0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );

    return {
      audioBuffer: Buffer.from(response.data),
      characterCount,
    };
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 400) throw new AppError('Text too long for speech synthesis', 400);
    if (status === 401) throw new AppError('OpenAI API key error', 503);
    throw new AppError(err?.response?.data?.error?.message || err.message || 'Speech synthesis failed', 500);
  }
}
