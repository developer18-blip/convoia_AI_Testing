import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/db.js';
import { jwtOrApiKey } from '../middleware/apiKeyAuth.js';
import { queryLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { afterQueryMiddleware, estimateCost } from '../middleware/tokenTracker.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';
import AIGatewayService from '../services/aiGatewayService.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import logger from '../config/logger.js';

const router = Router();

// All OpenWebUI routes require auth (JWT or API key)
router.use(jwtOrApiKey);

// ============== GET /models — OpenAI-compatible model list ==============
router.get('/models', asyncHandler(async (_req: Request, res: Response) => {
  const models = await prisma.aIModel.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  res.json({
    object: 'list',
    data: models.map((m) => ({
      id: m.id,
      object: 'model',
      created: Math.floor(m.createdAt.getTime() / 1000),
      owned_by: 'convoia',
      name: m.name,
      display_name: `${m.name} (${m.provider})`,
      description: m.description || '',
      context_length: m.contextWindow,
      capabilities: m.capabilities,
      pricing: {
        input: m.inputTokenPrice,
        output: m.outputTokenPrice,
      },
    })),
  });
}));

// ============== POST /chat/completions — OpenAI-compatible chat ==============
router.post('/chat/completions', queryLimiter, asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);

  const { model: rawModelId, messages, stream } = req.body;

  if (!rawModelId || !messages || !Array.isArray(messages) || messages.length === 0) {
    throw new AppError('model and messages are required', 400);
  }

  // Resolve model: accept UUID, model name, or provider modelId
  const aiModel = await prisma.aIModel.findFirst({
    where: {
      OR: [
        { id: rawModelId },
        { name: rawModelId },
        { modelId: rawModelId },
      ],
      isActive: true,
    },
    select: { id: true },
  });
  if (!aiModel) throw new AppError(`Model not found: ${rawModelId}`, 404);
  let modelId = aiModel.id;

  // Fetch user with wallet
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true },
  });
  if (!user) throw new AppError('User not found', 404);

  const organizationId = await getOrCreatePersonalOrg(user.id);

  // Check token balance with estimation
  const owuiTokenBal = await TokenWalletService.getBalance(user.id);
  const owuiInputText = messages.map((m: any) => m.content || '').join(' ');
  const owuiEstimatedInput = Math.ceil(owuiInputText.length / 4) + 500;
  const owuiMinRequired = owuiEstimatedInput + 200;

  if (owuiTokenBal.tokenBalance <= 0) {
    return res.status(402).json({
      error: { message: 'No tokens remaining.', type: 'no_tokens', code: 'NO_TOKENS' },
    });
  }
  if (owuiTokenBal.tokenBalance < owuiMinRequired) {
    return res.status(402).json({
      error: {
        message: `Insufficient tokens. Balance: ${TokenWalletService.formatTokens(owuiTokenBal.tokenBalance)}, estimated need: ${TokenWalletService.formatTokens(owuiMinRequired)}.`,
        type: 'insufficient_tokens',
        code: 'INSUFFICIENT_TOKENS',
      },
    });
  }

  // Check session access
  const activeSession = await prisma.hourlySession.findFirst({
    where: {
      userId: user.id,
      modelId,
      isActive: true,
      isExpired: false,
      endTime: { gt: new Date() },
    },
  });

  // Budget check with auto-downgrade
  let finalModelId = modelId;
  const budget = await prisma.budget.findFirst({
    where: { userId: user.id },
  });
  if (budget && budget.currentUsage >= budget.monthlyCap) {
    if (budget.autoDowngrade && budget.fallbackModelId) {
      finalModelId = budget.fallbackModelId;
    } else if (!budget.autoDowngrade) {
      return res.status(402).json({
        error: {
          message: 'Monthly budget cap reached.',
          type: 'budget_exceeded',
          code: 'budget_cap_reached',
        },
      });
    }
  }

  // Pre-query cost estimate (kept for usage tracking)
  const inputText = messages.map((m: any) => m.content || '').join(' ');
  const estimate = await estimateCost(finalModelId, inputText);

  // Cap output tokens so total stays within user's balance
  const owuiMaxOutput = Math.max(owuiTokenBal.tokenBalance - owuiEstimatedInput, 200);

  // Call AI provider
  const aiResponse = await AIGatewayService.sendMessage({
    userId: user.id,
    organizationId,
    modelId: finalModelId,
    messages,
    industry: user.organization?.industry || undefined,
    maxOutputTokens: owuiMaxOutput,
  });

  // Billing
  await afterQueryMiddleware(
    user.id,
    organizationId,
    aiResponse.aiModel.id,
    inputText,
    aiResponse.response,
    aiResponse.inputTokens,
    aiResponse.outputTokens,
    aiResponse.providerCost,
    aiResponse.customerPrice,
    aiResponse.markupPercentage,
    estimate?.customerPrice,
    activeSession?.id
  );

  // Deduct tokens from wallet
  await TokenWalletService.deductTokens({
    userId: user.id,
    tokens: aiResponse.totalTokens,
    reference: aiResponse.aiModel.id,
    description: `OpenWebUI: ${aiResponse.aiModel.name}`,
  });

  logger.info(
    `OpenWebUI query — User: ${user.id}, Model: ${aiResponse.aiModel.name}, Cost: $${aiResponse.customerPrice.toFixed(6)}`
  );

  const completionId = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  // Streaming response (SSE with non-streaming fallback)
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Split response into word-level chunks for realistic streaming
    const words = aiResponse.response.split(/(\s+)/);
    for (const word of words) {
      const chunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: rawModelId,
        choices: [{
          index: 0,
          delta: { content: word },
          finish_reason: null,
        }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // Final chunk with finish_reason
    const finalChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model: rawModelId,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: aiResponse.inputTokens,
        completion_tokens: aiResponse.outputTokens,
        total_tokens: aiResponse.totalTokens,
      },
    };
    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // Non-streaming response
  return res.json({
    id: completionId,
    object: 'chat.completion',
    created,
    model: rawModelId,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: aiResponse.response,
      },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: aiResponse.inputTokens,
      completion_tokens: aiResponse.outputTokens,
      total_tokens: aiResponse.totalTokens,
    },
  });
}));

export default router;
