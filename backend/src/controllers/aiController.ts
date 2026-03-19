import { Request, Response } from 'express';
import AIGatewayService from '../services/aiGatewayService.js';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { afterQueryMiddleware, estimateCost } from '../middleware/tokenTracker.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';
import logger from '../config/logger.js';

export const queryAI = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { modelId, messages, industry, agentId } = req.body;
  if (!modelId || !messages || messages.length === 0) {
    throw new AppError('modelId and messages are required', 400);
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { organization: true, wallet: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const organizationId = await getOrCreatePersonalOrg(user.id);
  if (!user.wallet || user.wallet.balance <= 0) {
    return res.status(402).json({
      success: false,
      message: 'Insufficient wallet balance. Please top up to continue.',
      walletBalance: user.wallet?.balance || 0,
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
  const inputText = messages.map((m: any) => m.content).join(' ');
  const estimate = await estimateCost(finalModelId, inputText);
  if (estimate && user.wallet.balance < estimate.customerPrice) {
    return res.status(402).json({
      success: false,
      message: 'Insufficient balance for this query.',
      walletBalance: user.wallet.balance,
      estimatedCost: estimate.customerPrice,
      shortfall: estimate.customerPrice - user.wallet.balance,
    });
  }
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

  const startTime = Date.now();
  const aiResponse = await AIGatewayService.sendMessage({
    userId: user.id,
    organizationId,
    modelId: finalModelId,
    messages,
    industry: industry || user.organization?.industry || undefined,
    agentConfig,
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
  logger.info(
    `Query complete — User: ${user.id}, Model: ${aiResponse.aiModel.name}, Cost: $${aiResponse.customerPrice.toFixed(6)}`
  );
  return res.json({
    success: true,
    statusCode: 200,
    message: 'Query executed successfully',
    data: {
      model: aiResponse.aiModel.name,
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
        estimated: estimate?.customerPrice.toFixed(6),
        currency: 'USD',
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
    include: { organization: true, wallet: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const organizationId = await getOrCreatePersonalOrg(user.id);
  if (!user.wallet || user.wallet.balance <= 0) {
    return res.status(402).json({
      success: false,
      message: 'Insufficient wallet balance. Please top up to continue.',
      walletBalance: user.wallet?.balance || 0,
    });
  }
  const startTime = Date.now();
  const inputText = messages.map((m: any) => m.content).join(' ');
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