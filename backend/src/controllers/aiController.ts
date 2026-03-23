import { Request, Response } from 'express';
import AIGatewayService from '../services/aiGatewayService.js';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { afterQueryMiddleware, estimateCost } from '../middleware/tokenTracker.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import { NotificationService } from '../services/notificationService.js';
import logger from '../config/logger.js';

// Image-only models that cannot handle chat/streaming
const IMAGE_ONLY_MODELS = new Set([
  'dall-e-3', 'dall-e-2', 'gpt-image-1', 'gpt-image-1-mini',
  'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview',
]);

export const queryAI = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { modelId, messages, industry, agentId } = req.body;
  if (!modelId || !messages || messages.length === 0) {
    throw new AppError('modelId and messages are required', 400);
  }
  // Block image-only models from chat
  const modelCheck = await prisma.aIModel.findUnique({ where: { id: modelId }, select: { modelId: true, name: true } });
  if (modelCheck && IMAGE_ONLY_MODELS.has(modelCheck.modelId)) {
    throw new AppError(`${modelCheck.name} is an image generation model and cannot be used for chat. Please select a different model.`, 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const organizationId = await getOrCreatePersonalOrg(user.id);

  // Check token balance — estimate includes system prompt (~500 tokens) + all message history
  const tokenBalance = await TokenWalletService.getBalance(user.id);
  const inputText = messages.map((m: any) => m.content).join(' ');
  // Realistic estimation: each char ≈ 0.25 tokens, plus ~500 for system prompt overhead
  const estimatedInputTokens = Math.ceil(inputText.length / 4) + 500;
  // Minimum balance needed: input estimate + 200 buffer for at least a short response
  const minimumRequired = estimatedInputTokens + 200;

  if (tokenBalance.tokenBalance <= 0) {
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'NO_TOKENS',
      message: isOrgMember
        ? 'You have no tokens remaining. Contact your manager for more tokens.'
        : 'You have no tokens remaining.',
      currentBalance: 0,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }

  if (tokenBalance.tokenBalance < minimumRequired) {
    const isOrgMember = !!user.organizationId;
    return res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: isOrgMember
        ? `Insufficient token balance. You have ${TokenWalletService.formatTokens(tokenBalance.tokenBalance)} tokens remaining. Contact your manager for more tokens.`
        : `You need more tokens. You have ${TokenWalletService.formatTokens(tokenBalance.tokenBalance)} tokens remaining.`,
      currentBalance: tokenBalance.tokenBalance,
      estimatedRequired: minimumRequired,
      canBuyTokens: !isOrgMember || user.role === 'org_owner',
    });
  }
  const activeSession = await prisma.hourlySession.findFirst({
    where: {
      userId: user.id,
      modelId,
      isActive: true,
      isExpired: false,
      endTime: { gt: new Date() },
    },
  });
  let finalModelId = modelId;
  let autoDowngraded = false;
  let autoDowngradeReason: string | undefined;
  const budget = await prisma.budget.findFirst({
    where: { userId: user.id },
  });
  if (budget && budget.currentUsage >= budget.monthlyCap) {
    if (budget.autoDowngrade && budget.fallbackModelId) {
      finalModelId = budget.fallbackModelId;
      autoDowngraded = true;
      autoDowngradeReason = `Budget cap reached ($${budget.currentUsage.toFixed(2)}/$${budget.monthlyCap.toFixed(2)}). Auto-downgraded to fallback model.`;
      logger.info(`User ${user.id} auto-downgraded due to budget cap. Original: ${modelId}, Fallback: ${finalModelId}`);
    } else if (!budget.autoDowngrade) {
      return res.status(402).json({
        success: false,
        message: 'Monthly budget cap reached. Auto-downgrade is disabled.',
        budgetUsage: budget.currentUsage,
        budgetCap: budget.monthlyCap,
      });
    }
  }
  const estimate = await estimateCost(finalModelId, inputText);
  // Look up agent config if specified
  let agentConfig: { systemPrompt: string; temperature: number; maxTokens: number; topP: number; name: string } | undefined;
  if (agentId) {
    const agent = await (prisma as any).agent.findUnique({ where: { id: agentId } });
    if (agent && agent.isActive) {
      agentConfig = {
        systemPrompt: agent.systemPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        topP: agent.topP,
        name: agent.name,
      };
      // Do NOT override finalModelId here — the frontend already sets the model
      // when an agent is selected. The user's explicit model choice must be respected.
    }
  }

  // Cap output tokens so total (input + output) stays within user's balance
  // Reserve tokens for estimated input; output gets the remainder
  const maxOutputForBalance = Math.max(tokenBalance.tokenBalance - estimatedInputTokens, 200);

  const startTime = Date.now();
  const aiResponse = await AIGatewayService.sendMessage({
    userId: user.id,
    organizationId,
    modelId: finalModelId,
    messages,
    industry: industry || user.organization?.industry || undefined,
    agentConfig,
    maxOutputTokens: maxOutputForBalance,
  });
  const executionTime = Date.now() - startTime;
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
    description: `Query: ${aiResponse.aiModel.name}`,
  });

  // Check for low balance and notify (fire and forget)
  const balAfter = await TokenWalletService.getBalance(user.id);
  if (balAfter.tokenBalance > 0 && balAfter.tokenBalance < 5000) {
    NotificationService.onLowBalance(user.id, balAfter.tokenBalance).catch(() => {});
  }

  logger.info(
    `Query complete — User: ${user.id}, Model: ${aiResponse.aiModel.name}, Tokens: ${aiResponse.totalTokens}`
  );
  return res.json({
    success: true,
    statusCode: 200,
    message: 'Query executed successfully',
    data: {
      model: aiResponse.aiModel.name,
      provider: aiResponse.aiModel.provider,
      response: aiResponse.response,
      tokensUsed: aiResponse.totalTokens,
      tokens: {
        input: aiResponse.inputTokens,
        output: aiResponse.outputTokens,
        total: aiResponse.totalTokens,
      },
      fallback: aiResponse.fallbackUsed
        ? {
            used: true,
            reason: aiResponse.fallbackReason,
            model: aiResponse.aiModel.name,
          }
        : { used: false },
      autoDowngraded,
      autoDowngradeReason,
      originalModelId: autoDowngraded ? modelId : undefined,
      executionTime,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * SSE streaming endpoint — streams AI response token-by-token.
 * Sends: data chunks, then a final [DONE] event with metadata.
 */
export const queryAIStream = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { modelId, messages, industry, agentId } = req.body;
    if (!modelId || !messages || messages.length === 0) {
      res.status(400).json({ success: false, message: 'modelId and messages are required' });
      return;
    }

    // Block image-only models from streaming chat
    const streamModelCheck = await prisma.aIModel.findUnique({ where: { id: modelId }, select: { modelId: true, name: true } });
    if (streamModelCheck && IMAGE_ONLY_MODELS.has(streamModelCheck.modelId)) {
      res.status(400).json({ success: false, message: `${streamModelCheck.name} is an image generation model. Please select a chat model.` });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organization: true },
    });
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }
    const organizationId = await getOrCreatePersonalOrg(user.id);

    // Check token balance — estimate includes system prompt (~500 tokens) + all message history
    const streamTokenBalance = await TokenWalletService.getBalance(user.id);
    const inputText = messages.map((m: any) => m.content).join(' ');
    const estimatedInputTokens = Math.ceil(inputText.length / 4) + 500;
    const minimumRequired = estimatedInputTokens + 200;

    if (streamTokenBalance.tokenBalance <= 0) {
      const isOrgMember = !!user.organizationId;
      res.status(402).json({
        success: false,
        code: 'NO_TOKENS',
        message: isOrgMember
          ? 'You have no tokens remaining. Contact your manager for more tokens.'
          : 'You have no tokens remaining.',
        currentBalance: 0,
        canBuyTokens: !isOrgMember || user.role === 'org_owner',
      });
      return;
    }

    if (streamTokenBalance.tokenBalance < minimumRequired) {
      const isOrgMember = !!user.organizationId;
      res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_TOKENS',
        message: isOrgMember
          ? `Insufficient token balance. You have ${TokenWalletService.formatTokens(streamTokenBalance.tokenBalance)} tokens. Contact your manager.`
          : `You need more tokens. You have ${TokenWalletService.formatTokens(streamTokenBalance.tokenBalance)} tokens remaining.`,
        currentBalance: streamTokenBalance.tokenBalance,
        estimatedRequired: minimumRequired,
        canBuyTokens: !isOrgMember || user.role === 'org_owner',
      });
      return;
    }

    // Budget check
    let finalModelId = modelId;
    let autoDowngraded = false;
    let autoDowngradeReason: string | undefined;
    const budget = await prisma.budget.findFirst({ where: { userId: user.id } });
    if (budget && budget.currentUsage >= budget.monthlyCap) {
      if (budget.autoDowngrade && budget.fallbackModelId) {
        finalModelId = budget.fallbackModelId;
        autoDowngraded = true;
        autoDowngradeReason = `Budget cap reached. Auto-downgraded to fallback model.`;
      } else if (!budget.autoDowngrade) {
        res.status(402).json({ success: false, message: 'Monthly budget cap reached' });
        return;
      }
    }

    const estimate = await estimateCost(finalModelId, inputText);

    // Active session check
    const activeSession = await prisma.hourlySession.findFirst({
      where: { userId: user.id, modelId: finalModelId, isActive: true, isExpired: false, endTime: { gt: new Date() } },
    });

    // Agent config
    let agentConfig: { systemPrompt: string; temperature: number; maxTokens: number; topP: number; name: string } | undefined;
    if (agentId) {
      const agent = await (prisma as any).agent.findUnique({ where: { id: agentId } });
      if (agent && agent.isActive) {
        agentConfig = {
          systemPrompt: agent.systemPrompt, temperature: agent.temperature,
          maxTokens: agent.maxTokens, topP: agent.topP, name: agent.name,
        };
      }
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Auto-downgrade note
    if (autoDowngraded && autoDowngradeReason) {
      res.write(`data: ${JSON.stringify({ type: 'note', content: autoDowngradeReason })}\n\n`);
    }

    // Cap output tokens so total (input + output) stays within user's balance
    const streamMaxOutput = Math.max(streamTokenBalance.tokenBalance - estimatedInputTokens, 200);

    const startTime = Date.now();
    let fullResponse = '';
    let streamEnded = false;

    // Handle client disconnect
    req.on('close', () => {
      streamEnded = true;
      logger.info(`Client disconnected from stream — User: ${user.id}`);
    });

    await AIGatewayService.sendMessageStream(
      {
        userId: user.id, organizationId,
        modelId: finalModelId, messages,
        industry: industry || user.organization?.industry || undefined,
        agentConfig,
        maxOutputTokens: streamMaxOutput,
      },
      {
        onChunk: (text: string) => {
          if (streamEnded) return;
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
        },
        onDone: (rawInputTokens: number, rawOutputTokens: number) => {
          // Fire-and-forget the async post-processing
          (async () => {
            try {
              const executionTime = Date.now() - startTime;

              const aiModel = await prisma.aIModel.findUnique({ where: { id: finalModelId } });
              if (!aiModel) {
                if (!streamEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'error', content: 'Model not found' })}\n\n`);
                  res.write('data: [DONE]\n\n');
                  res.end();
                }
                return;
              }

              // Fallback: if provider didn't report token counts, estimate from text
              const inputTokens = rawInputTokens > 0 ? rawInputTokens : Math.ceil(inputText.length / 4) + 500;
              const outputTokens = rawOutputTokens > 0 ? rawOutputTokens : Math.ceil(fullResponse.length / 4);
              const totalTokensUsed = inputTokens + outputTokens;

              if (rawInputTokens === 0 && rawOutputTokens === 0) {
                logger.warn(`Provider reported 0 tokens — using estimates: input=${inputTokens} output=${outputTokens} total=${totalTokensUsed}`);
              }

              const providerCost = inputTokens * aiModel.inputTokenPrice + outputTokens * aiModel.outputTokenPrice;
              const customerPrice = providerCost * (1 + aiModel.markupPercentage / 100);

              // Track usage and deduct tokens — await both to ensure billing
              await Promise.all([
                afterQueryMiddleware(
                  user.id, organizationId, aiModel.id,
                  inputText, fullResponse,
                  inputTokens, outputTokens,
                  providerCost, customerPrice,
                  aiModel.markupPercentage,
                  estimate?.customerPrice,
                  activeSession?.id
                ).catch(err => logger.error('Usage tracking error:', err)),
                TokenWalletService.deductTokens({
                  userId: user.id,
                  tokens: totalTokensUsed,
                  reference: aiModel.id,
                  description: `Query: ${aiModel.name}`,
                }).catch(err => logger.error('Token deduction error:', err)),
              ]);

              if (!streamEnded && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({
                  type: 'done',
                  model: aiModel.name,
                  provider: aiModel.provider,
                  tokens: { input: inputTokens, output: outputTokens, total: totalTokensUsed },
                  tokensUsed: totalTokensUsed,
                  executionTime,
                })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
              }

              logger.info(`Stream complete — User: ${user.id}, Model: ${aiModel.name}, Cost: $${customerPrice.toFixed(6)}`);
            } catch (err: any) {
              logger.error(`Stream finalize error: ${err.message}`);
              if (!streamEnded && !res.writableEnded) {
                try { res.write('data: [DONE]\n\n'); res.end(); } catch { /* already closed */ }
              }
            }
          })();
        },
        onError: (error: Error & { response?: { data?: any; status?: number } }) => {
          const providerErr = error.response?.data;
          logger.error(`Stream error: ${error.message}`, {
            status: error.response?.status,
            provider_error: providerErr?.error?.message || providerErr?.message || undefined,
            provider_type: providerErr?.error?.type || undefined,
          });
          streamEnded = true;
          if (!res.writableEnded) {
            try {
              res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            } catch { /* response already closed */ }
          }
        },
      }
    ).catch(() => {
      // Stream errors are already handled by onError callback above.
      // This catch prevents unhandled rejection without double-writing.
    });
  } catch (err: any) {
    logger.error(`Stream setup error: ${err.message}`);
    if (!res.headersSent) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    } else if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch { /* response already closed */ }
    }
  }
};

export const compareModels = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { modelIds, messages, industry } = req.body;
  if (!modelIds || modelIds.length === 0 || !messages) {
    throw new AppError('modelIds array and messages are required', 400);
  }
  if (modelIds.length > 5) {
    throw new AppError('Cannot compare more than 5 models at once', 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const organizationId = await getOrCreatePersonalOrg(user.id);

  const compareTokenBal = await TokenWalletService.getBalance(user.id);
  const inputText = messages.map((m: any) => m.content).join(' ');
  // Estimate: (input + system prompt + response buffer) * number of models
  const estimatedInputPerModel = Math.ceil(inputText.length / 4) + 500;
  const estimatedPerModel = estimatedInputPerModel + 2000; // allow ~2000 output per model
  const estimatedTotal = estimatedPerModel * modelIds.length;

  if (compareTokenBal.tokenBalance <= 0) {
    return res.status(402).json({
      success: false,
      code: 'NO_TOKENS',
      message: 'You have no tokens remaining.',
      currentBalance: 0,
    });
  }
  if (compareTokenBal.tokenBalance < estimatedTotal) {
    return res.status(402).json({
      success: false,
      code: 'INSUFFICIENT_TOKENS',
      message: `Comparing ${modelIds.length} models requires ~${TokenWalletService.formatTokens(estimatedTotal)} tokens. You have ${TokenWalletService.formatTokens(compareTokenBal.tokenBalance)}.`,
      currentBalance: compareTokenBal.tokenBalance,
      estimatedRequired: estimatedTotal,
    });
  }
  const startTime = Date.now();
  const queries = modelIds.map((id: string) =>
    AIGatewayService.sendMessage({
      userId: user.id,
      organizationId,
      modelId: id,
      messages,
      industry: industry || user.organization?.industry || undefined,
    })
      .then(async (aiResponse) => {
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
          aiResponse.markupPercentage
        );
        // Deduct tokens for this model's response
        await TokenWalletService.deductTokens({
          userId: user.id,
          tokens: aiResponse.totalTokens,
          reference: aiResponse.aiModel.id,
          description: `Compare: ${aiResponse.aiModel.name}`,
        });
        return {
          modelId: id,
          modelName: aiResponse.aiModel.name,
          provider: aiResponse.aiModel.provider,
          response: aiResponse.response,
          tokens: {
            input: aiResponse.inputTokens,
            output: aiResponse.outputTokens,
            total: aiResponse.totalTokens,
          },
          cost: {
            provider: aiResponse.providerCost.toFixed(6),
            charged: aiResponse.customerPrice.toFixed(6),
          },
          fallbackUsed: aiResponse.fallbackUsed,
        };
      })
      .catch((error) => ({
        modelId: id,
        error: error.message,
        failed: true,
      }))
  );
  const responses = await Promise.all(queries);
  const executionTime = Date.now() - startTime;
  const successful = responses.filter((r) => !('failed' in r));
  const failed = responses.filter((r) => 'failed' in r);
  const totalCost = successful.reduce(
    (sum: number, r: any) => sum + parseFloat(r.cost?.charged || 0),
    0
  );
  return res.json({
    success: true,
    statusCode: 200,
    message: 'Model comparison completed',
    data: {
      responses: successful,
      failed,
      summary: {
        totalModels: modelIds.length,
        successful: successful.length,
        failed: failed.length,
        totalCost: totalCost.toFixed(6),
        executionTime,
      },
      timestamp: new Date().toISOString(),
    },
  });
});