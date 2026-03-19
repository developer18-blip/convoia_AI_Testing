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

    await prisma.$transaction(async (tx) => {
      // 1. Create usage log
      await tx.usageLog.create({
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

      // 2. Deduct from wallet and get wallet in one query
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: customerPrice },
          totalSpent: { increment: customerPrice },
        },
      });

      // 3. Create wallet transaction (using wallet.id from step 2)
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: customerPrice,
          type: 'debit',
          description: `AI query cost`,
          reference: modelId,
        },
      });

      // 4. Update budget usage if exists
      const budget = await tx.budget.findFirst({
        where: { userId },
      });

      if (budget) {
        const newUsage = budget.currentUsage + customerPrice;
        const usagePercent = (newUsage / budget.monthlyCap) * 100;
        const shouldAlert =
          usagePercent >= budget.alertThreshold && !budget.alertSent;

        await tx.budget.update({
          where: { id: budget.id },
          data: {
            currentUsage: newUsage,
            ...(shouldAlert ? { alertSent: true } : {}),
          },
        });

        if (shouldAlert) {
          logger.warn(
            `BUDGET ALERT: User ${userId} reached ${usagePercent.toFixed(1)}% of monthly budget`
          );
        }
      }

      // 5. Update subscription token usage if exists
      const subscription = await tx.subscription.findFirst({
        where: { userId, status: 'active' },
      });

      if (subscription) {
        const newTokenUsage = subscription.tokensUsedThisMonth + totalTokens;
        const quotaExceeded = newTokenUsage >= subscription.monthlyTokenQuota;

        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            tokensUsedThisMonth: newTokenUsage,
            ...(quotaExceeded ? { status: 'quota_exceeded' } : {}),
          },
        });

        if (quotaExceeded) {
          logger.warn(`QUOTA EXCEEDED: User ${userId} exceeded monthly token quota`);
        }
      }
    });

    logger.info(
      `Query tracked — User: ${userId}, Cost: $${customerPrice.toFixed(6)}, Profit: $${profit.toFixed(6)}`
    );
  } catch (error) {
    // Never crash the request — just log the error
    logger.error('afterQueryMiddleware error:', error);
  }
}
