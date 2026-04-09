import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import {
  transcribeAudio,
  synthesizeSpeech,
  calculateWhisperTokenCost,
  calculateTTSTokenCost,
} from '../services/audioService.js';

/**
 * POST /api/audio/transcribe
 * Accepts multipart/form-data with 'audio' file field.
 * Returns transcript, language, duration, and token cost.
 */
export const transcribeAudioHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const audioFile = (req as any).file;
    if (!audioFile) {
      throw new AppError('No audio file provided', 400);
    }

    // 25MB limit (OpenAI Whisper max)
    const MAX_SIZE = 25 * 1024 * 1024;
    if (audioFile.size > MAX_SIZE) {
      throw new AppError('Audio file too large. Maximum size is 25MB.', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organization: true },
    });
    if (!user) throw new AppError('User not found', 404);

    const organizationId = await getOrCreatePersonalOrg(user.id);

    // Token balance check — estimate 2 min max before we know actual duration
    const maxEstimatedCost = calculateWhisperTokenCost(120);
    const tokenBalance = await TokenWalletService.getBalance(user.id);

    if (tokenBalance.tokenBalance <= 0) {
      throw new AppError('No tokens remaining.', 402);
    }

    if (tokenBalance.tokenBalance < maxEstimatedCost.walletTokens) {
      throw new AppError(
        `Insufficient tokens for voice transcription. You have ${TokenWalletService.formatTokens(tokenBalance.tokenBalance)} tokens.`,
        402
      );
    }

    const apiKey = config.apiKeys.openai;
    if (!apiKey) throw new AppError('OpenAI not configured', 503);

    // Transcribe
    const language = req.body?.language || undefined;
    const result = await transcribeAudio(
      audioFile.buffer,
      audioFile.mimetype || 'audio/webm',
      apiKey,
      language
    );

    // Bill actual duration
    const billing = calculateWhisperTokenCost(result.durationSeconds);

    await TokenWalletService.deductTokens({
      userId: user.id,
      tokens: billing.walletTokens,
      reference: `whisper-${Date.now()}`,
      description: `Voice transcription (${Math.round(result.durationSeconds)}s)`,
      organizationId,
    });

    // Log usage (non-fatal)
    try {
      const openaiModel = await prisma.aIModel.findFirst({
        where: { isActive: true, provider: 'openai' },
        select: { id: true },
        orderBy: { inputTokenPrice: 'asc' },
      });
      await prisma.usageLog.create({
        data: {
          userId: user.id,
          organizationId,
          modelId: openaiModel?.id || '',
          prompt: '[voice input]',
          response: result.transcript.substring(0, 500),
          tokensInput: billing.walletTokens,
          tokensOutput: 0,
          totalTokens: billing.walletTokens,
          providerCost: billing.providerCost,
          markupPercentage: 30,
          customerPrice: billing.customerPrice,
          status: 'completed',
        },
      });
    } catch { /* non-fatal — never block the response */ }

    logger.info(
      `Voice transcription: user=${user.id} duration=${result.durationSeconds.toFixed(1)}s tokens=${billing.walletTokens} lang=${result.language}`
    );

    return res.json({
      success: true,
      data: {
        transcript: result.transcript,
        language: result.language,
        durationSeconds: result.durationSeconds,
        tokensUsed: billing.walletTokens,
        cost: billing.customerPrice.toFixed(6),
      },
    });
  }
);

/**
 * POST /api/audio/speak
 * Accepts JSON { text: string, voice?: string }.
 * Returns MP3 audio stream.
 */
export const synthesizeSpeechHandler = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { text, voice = 'nova' } = req.body;
    if (!text || typeof text !== 'string') {
      throw new AppError('text is required', 400);
    }

    const VALID_VOICES = ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'] as const;
    if (!VALID_VOICES.includes(voice)) {
      throw new AppError(`Invalid voice. Choose from: ${VALID_VOICES.join(', ')}`, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organization: true },
    });
    if (!user) throw new AppError('User not found', 404);

    const organizationId = await getOrCreatePersonalOrg(user.id);

    // Truncate to TTS limit
    const truncatedText = text.slice(0, 4096);
    const charCount = truncatedText.length;

    // Token balance check
    const billing = calculateTTSTokenCost(charCount);
    const tokenBalance = await TokenWalletService.getBalance(user.id);

    if (tokenBalance.tokenBalance <= 0) {
      throw new AppError('No tokens remaining.', 402);
    }

    if (tokenBalance.tokenBalance < billing.walletTokens) {
      throw new AppError(
        `Insufficient tokens for voice synthesis. Need ${billing.walletTokens} tokens, have ${TokenWalletService.formatTokens(tokenBalance.tokenBalance)}.`,
        402
      );
    }

    const apiKey = config.apiKeys.openai;
    if (!apiKey) throw new AppError('OpenAI not configured', 503);

    // Synthesize
    const result = await synthesizeSpeech(truncatedText, apiKey, voice as any);

    // Bill
    await TokenWalletService.deductTokens({
      userId: user.id,
      tokens: billing.walletTokens,
      reference: `tts-${Date.now()}`,
      description: `Voice synthesis (${charCount} chars, ${voice})`,
      organizationId,
    });

    // Log usage (non-fatal)
    try {
      const openaiModel = await prisma.aIModel.findFirst({
        where: { isActive: true, provider: 'openai' },
        select: { id: true },
        orderBy: { inputTokenPrice: 'asc' },
      });
      await prisma.usageLog.create({
        data: {
          userId: user.id,
          organizationId,
          modelId: openaiModel?.id || '',
          prompt: truncatedText.substring(0, 200),
          response: '[audio output]',
          tokensInput: 0,
          tokensOutput: billing.walletTokens,
          totalTokens: billing.walletTokens,
          providerCost: billing.providerCost,
          markupPercentage: 30,
          customerPrice: billing.customerPrice,
          status: 'completed',
        },
      });
    } catch { /* non-fatal */ }

    logger.info(
      `TTS synthesis: user=${user.id} chars=${charCount} voice=${voice} tokens=${billing.walletTokens}`
    );

    // Stream MP3 back directly
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', result.audioBuffer.length);
    res.setHeader('Content-Disposition', 'inline; filename="response.mp3"');
    res.send(result.audioBuffer);
  }
);
