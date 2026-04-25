import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { costAdjustedTokens } from '../config/tokenPackages.js';

// Alert threshold: log a CRITICAL warning when a single deduction exceeds this many tokens.
// A Starter pack = 500k tokens. Losing >100k in one call is unusual and worth tracking.
const LARGE_DEDUCTION_THRESHOLD = 100_000;

// Hard safety cap: a single query can never drain more than this many wallet tokens,
// regardless of model price + markup. Prevents a misconfigured markup or a runaway
// long-context query from zeroing the wallet in one shot.
// 300k = 60% of a Starter pack — still large, but leaves the user some balance.
export const MAX_SINGLE_DEDUCTION = 300_000;

export class TokenWalletService {
  static async getOrCreateWallet(userId: string) {
    return await prisma.tokenWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, tokenBalance: 0, totalTokensPurchased: 0, totalTokensUsed: 0, allocatedTokens: 0 },
    });
  }

  static async getBalance(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);
    return {
      tokenBalance: wallet.tokenBalance,
      totalPurchased: wallet.totalTokensPurchased,
      totalUsed: wallet.totalTokensUsed,
      allocatedTokens: wallet.allocatedTokens,
    };
  }

  static async addTokens(params: {
    userId: string;
    tokens: number;
    reference: string;
    description: string;
    organizationId?: string;
  }) {
    const { userId, tokens, reference, description, organizationId } = params;

    logger.info(`addTokens called: userId=${userId} tokens=${tokens} ref=${reference}`);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.tokenWallet.findUnique({ where: { userId } });
        logger.info(`Existing wallet: ${existing ? `balance=${existing.tokenBalance}` : 'NONE'}`);

        const wallet = await tx.tokenWallet.upsert({
          where: { userId },
          update: {
            tokenBalance: { increment: tokens },
            totalTokensPurchased: { increment: tokens },
          },
          create: {
            userId,
            tokenBalance: tokens,
            totalTokensPurchased: tokens,
            totalTokensUsed: 0,
            allocatedTokens: 0,
          },
        });

        logger.info(`Wallet after upsert: balance=${wallet.tokenBalance}`);

        await tx.tokenTransaction.create({
          data: {
            userId,
            type: 'purchase',
            tokens,
            balanceAfter: wallet.tokenBalance,
            description,
            reference,
          },
        });

        if (organizationId) {
          await tx.organization.update({
            where: { id: organizationId },
            data: { orgTokenBalance: { increment: tokens } },
          });
        }

        return wallet;
      });

      logger.info(`addTokens SUCCESS: userId=${userId} newBalance=${result.tokenBalance}`);
      return result;
    } catch (err) {
      logger.error(`addTokens FAILED: ${err}`);
      throw err;
    }
  }

  /**
   * Deduct tokens from wallet. If user has fewer tokens than requested,
   * deducts whatever is available (never lets a query go free — we've
   * already paid the provider for the response).
   *
   * Atomicity: locks the wallet row with SELECT ... FOR UPDATE inside
   * a transaction so concurrent deductions can't read the same balance
   * and double-spend it. Without this, two simultaneous queries could
   * each see balance=100 and both decrement it, producing a -100 wallet.
   */
  static async deductTokens(params: {
    userId: string;
    tokens: number;
    reference: string;
    description: string;
    organizationId?: string;
  }): Promise<number> {
    const { userId, tokens: rawTokens, reference, description, organizationId } = params;

    // Apply the hard per-query safety cap before anything touches the DB.
    const tokens = Math.min(rawTokens, MAX_SINGLE_DEDUCTION);
    if (tokens < rawTokens) {
      logger.warn(
        `DEDUCTION_CAP_APPLIED: userId=${userId} requested=${rawTokens} capped=${tokens} ` +
        `(MAX_SINGLE_DEDUCTION=${MAX_SINGLE_DEDUCTION}) — possible misconfigured markup or huge context.`
      );
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Pessimistic row lock — held until the transaction commits.
        const locked = await tx.$queryRaw<Array<{ tokenBalance: number }>>`
          SELECT "tokenBalance" FROM "TokenWallet"
          WHERE "userId" = ${userId}
          FOR UPDATE
        `;

        if (locked.length === 0 || locked[0].tokenBalance <= 0) {
          logger.warn(`Token deduction BLOCKED — wallet empty: userId=${userId} orgId=${organizationId || 'none'} requested=${tokens}`);
          return 0;
        }

        const balanceBefore = locked[0].tokenBalance;
        const actualDeduct = Math.min(tokens, balanceBefore);

        // Alert when a single call drains a lot of tokens — helps diagnose runaway costs.
        if (actualDeduct >= LARGE_DEDUCTION_THRESHOLD) {
          logger.warn(
            `LARGE_DEDUCTION_ALERT: userId=${userId} orgId=${organizationId || 'none'} ` +
            `deducting=${actualDeduct} walletBefore=${balanceBefore} ` +
            `remainingAfter=${balanceBefore - actualDeduct} ref=${reference}`
          );
        }

        const updated = await tx.tokenWallet.update({
          where: { userId },
          data: {
            tokenBalance: { decrement: actualDeduct },
            totalTokensUsed: { increment: actualDeduct },
          },
        });

        await tx.tokenTransaction.create({
          data: {
            userId,
            type: 'usage',
            tokens: -actualDeduct,
            balanceAfter: updated.tokenBalance,
            description,
            reference,
          },
        });

        if (organizationId) {
          await tx.organization.update({
            where: { id: organizationId },
            data: { orgTokenBalance: { decrement: actualDeduct } },
          }).catch(() => { /* org may not exist for personal accounts */ });
        }

        if (actualDeduct < tokens) {
          logger.warn(`Partial deduction: userId=${userId} orgId=${organizationId || 'none'} requested=${tokens} actual=${actualDeduct} remaining=0`);
        }

        logger.info(`Token deduction: userId=${userId} orgId=${organizationId || 'none'} before=${balanceBefore} deducted=${actualDeduct} after=${updated.tokenBalance}`);

        return actualDeduct;
      }, { timeout: 10000 });
    } catch (err) {
      logger.error('Token deduction error:', err);
      return 0;
    }
  }

  static async hasEnoughTokens(userId: string, requiredTokens: number): Promise<boolean> {
    const wallet = await prisma.tokenWallet.findUnique({ where: { userId } });
    return (wallet?.tokenBalance ?? 0) >= requiredTokens;
  }

  static async allocateTokens(params: {
    fromUserId: string;
    toUserId: string;
    tokens: number;
    organizationId: string;
  }) {
    const { fromUserId, toUserId, tokens } = params;

    return await prisma.$transaction(async (tx) => {
      // Lock the source wallet row so a concurrent allocation can't
      // read the same balance and over-allocate.
      const locked = await tx.$queryRaw<Array<{ tokenBalance: number }>>`
        SELECT "tokenBalance" FROM "TokenWallet"
        WHERE "userId" = ${fromUserId}
        FOR UPDATE
      `;
      if (locked.length === 0 || locked[0].tokenBalance < tokens) {
        throw new Error('Insufficient token balance to allocate');
      }

      const updatedFrom = await tx.tokenWallet.update({
        where: { userId: fromUserId },
        data: { tokenBalance: { decrement: tokens } },
      });

      await tx.tokenTransaction.create({
        data: {
          userId: fromUserId,
          type: 'allocation_given',
          tokens: -tokens,
          balanceAfter: updatedFrom.tokenBalance,
          description: `Allocated ${tokens.toLocaleString()} tokens`,
          reference: toUserId,
        },
      });

      const toWallet = await tx.tokenWallet.upsert({
        where: { userId: toUserId },
        update: {
          tokenBalance: { increment: tokens },
          allocatedTokens: { increment: tokens },
          allocatedBy: fromUserId,
        },
        create: {
          userId: toUserId,
          tokenBalance: tokens,
          totalTokensPurchased: 0,
          totalTokensUsed: 0,
          allocatedTokens: tokens,
          allocatedBy: fromUserId,
        },
      });

      await tx.tokenTransaction.create({
        data: {
          userId: toUserId,
          type: 'allocation_received',
          tokens,
          balanceAfter: toWallet.tokenBalance,
          description: `Received ${tokens.toLocaleString()} tokens`,
          reference: fromUserId,
        },
      });

      logger.info(`Tokens allocated: from=${fromUserId} to=${toUserId} tokens=${tokens}`);
    });
  }

  static async getTransactionHistory(userId: string, limit = 20, page = 1) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      prisma.tokenTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.tokenTransaction.count({ where: { userId } }),
    ]);
    return { transactions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Estimate the wallet-token cost of a query before the provider runs.
   * Uses worst-case maxOutputTokens. Caller can compare result against balance.
   * Returns null if model lookup fails — caller falls back to existing behavior.
   */
  static async estimateQueryCost(params: {
    modelId: string;
    estInputTokens: number;
    maxOutputTokens: number;
  }): Promise<{ estimatedTokens: number; estimatedCost: number } | null> {
    const aiModel = await prisma.aIModel.findUnique({
      where: { id: params.modelId },
    });
    if (!aiModel) return null;
    const providerCost =
      params.estInputTokens * aiModel.inputTokenPrice +
      params.maxOutputTokens * aiModel.outputTokenPrice;
    const customerPrice = providerCost * (1 + aiModel.markupPercentage / 100);
    const rawWalletTokens = costAdjustedTokens(
      customerPrice,
      params.estInputTokens + params.maxOutputTokens,
    );
    // 10% safety margin absorbs tokenizer variance + markup drift
    const estimatedTokens = Math.ceil(rawWalletTokens * 1.1);
    return { estimatedTokens, estimatedCost: customerPrice };
  }

  /**
   * Pre-flight balance gate. Compares user balance against estimated query cost.
   * Returns { ok: true } if user has enough; { ok: false, ... } with details to
   * surface in the 402 response otherwise.
   *
   * If model lookup fails (estimateQueryCost returns null), falls back to a
   * lenient gate (balance > 0). Caller can still apply its own stricter check.
   */
  static async checkBalanceForQuery(params: {
    userId: string;
    modelId: string;
    estInputTokens: number;
    maxOutputTokens: number;
  }): Promise<
    | { ok: true; estimated: number; balance: number }
    | { ok: false; estimated: number; balance: number }
  > {
    const wallet = await this.getBalance(params.userId);
    const cost = await this.estimateQueryCost({
      modelId: params.modelId,
      estInputTokens: params.estInputTokens,
      maxOutputTokens: params.maxOutputTokens,
    });
    if (!cost) {
      // Model lookup failed — fall back to "any balance" check
      return wallet.tokenBalance > 0
        ? { ok: true, estimated: 0, balance: wallet.tokenBalance }
        : { ok: false, estimated: 0, balance: wallet.tokenBalance };
    }
    if (wallet.tokenBalance < cost.estimatedTokens) {
      return { ok: false, estimated: cost.estimatedTokens, balance: wallet.tokenBalance };
    }
    return { ok: true, estimated: cost.estimatedTokens, balance: wallet.tokenBalance };
  }

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  static formatTokens(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return count.toLocaleString();
  }
}
