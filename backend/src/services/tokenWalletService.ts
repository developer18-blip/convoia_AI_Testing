import prisma from '../config/db.js';
import logger from '../config/logger.js';

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
   * deducts whatever is available (never lets a query go free).
   * Returns the number of tokens actually deducted.
   */
  static async deductTokens(params: {
    userId: string;
    tokens: number;
    reference: string;
    description: string;
    organizationId?: string;
  }): Promise<number> {
    const { userId, tokens, reference, description, organizationId } = params;

    try {
      return await prisma.$transaction(async (tx) => {
        const wallet = await tx.tokenWallet.findUnique({ where: { userId } });
        if (!wallet || wallet.tokenBalance <= 0) {
          logger.warn(`Token deduction BLOCKED — wallet empty: userId=${userId} orgId=${organizationId || 'none'} requested=${tokens}`);
          return 0;
        }

        const balanceBefore = wallet.tokenBalance;
        // Deduct up to what's available — never let a query go completely free
        const actualDeduct = Math.min(tokens, wallet.tokenBalance);

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

        if (actualDeduct < tokens) {
          logger.warn(`Partial deduction: userId=${userId} orgId=${organizationId || 'none'} requested=${tokens} actual=${actualDeduct} remaining=0`);
        }

        logger.info(`Token deduction: userId=${userId} orgId=${organizationId || 'none'} before=${balanceBefore} deducted=${actualDeduct} after=${updated.tokenBalance}`);

        return actualDeduct;
      });
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
      const fromWallet = await tx.tokenWallet.findUnique({ where: { userId: fromUserId } });
      if (!fromWallet || fromWallet.tokenBalance < tokens) {
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

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  static formatTokens(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return count.toLocaleString();
  }
}
