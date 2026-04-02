import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { getOrCreatePersonalOrg } from '../utils/orgHelper.js';

// Estimate tokens and cost before query
export async function estimateCost(modelId: string, inputText: string) {
  try {
    const estimatedTokens = Math.ceil(inputText.length / 4);
    const model = await prisma.aIModel.findUnique({
      where: { id: modelId },
    });

    if (!model) return null;

    const providerCost =
      estimatedTokens * model.inputTokenPrice +
      estimatedTokens * 0.5 * model.outputTokenPrice;
    const customerPrice =
      providerCost * (1 + model.markupPercentage / 100);

    return {
      estimatedTokens,
      providerCost,
      customerPrice,
      model: model.name,
    };
  } catch (error) {
    logger.error('estimateCost error:', error);
    return null;
  }
}

// Runs AFTER AI query — all billing operations in a single transaction
export async function afterQueryMiddleware(
  userId: string,
  _organizationId: string,
  modelId: string,
  prompt: string,
  response: string,
  inputTokens: number,
  outputTokens: number,
  providerCost: number,
  customerPrice: number,
  markupPercentage: number,
  estimatedCostShown?: number,
  sessionId?: string
) {
  try {
    const totalTokens = inputTokens + outputTokens;
    const profit = customerPrice - providerCost;

    // Ensure organizationId is valid — resolve or create personal org
    const finalOrgId = await getOrCreatePersonalOrg(userId);

    // 1. ALWAYS create usage log (outside transaction so it's never rolled back)
    await prisma.usageLog.create({
      data: {
        userId,
        organizationId: finalOrgId,
        modelId,
        prompt,
        response,
        tokensInput: inputTokens,
        tokensOutput: outputTokens,
        totalTokens,
        providerCost,
        markupPercentage,
        customerPrice,
        estimatedCostShown,
        sessionId,
        status: 'completed',
      },
    });

    // 2. Token deduction is handled by TokenWalletService.deductTokens() in aiController.
    // Single billing system: tokens only. No subscriptions, no fiat wallet.

    logger.info(
      `Query tracked — User: ${userId}, Cost: $${customerPrice.toFixed(6)}, Profit: $${profit.toFixed(6)}`
    );
  } catch (error) {
    // Never crash the request — just log the error
    logger.error('afterQueryMiddleware error:', error);
  }
}
