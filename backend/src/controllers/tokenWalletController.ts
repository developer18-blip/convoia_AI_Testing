import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import { TOKEN_PACKAGES } from '../config/tokenPackages.js';
import prisma from '../config/db.js';

export const getTokenBalance = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    // getOrCreateWallet ensures wallet exists
    const wallet = await TokenWalletService.getOrCreateWallet(req.user.userId);
    const history = await TokenWalletService.getTransactionHistory(req.user.userId, 5);

    res.json({
      success: true,
      data: {
        tokenBalance: wallet.tokenBalance,
        totalPurchased: wallet.totalTokensPurchased,
        totalUsed: wallet.totalTokensUsed,
        allocatedTokens: wallet.allocatedTokens,
        formatted: {
          balance: TokenWalletService.formatTokens(wallet.tokenBalance),
          totalPurchased: TokenWalletService.formatTokens(wallet.totalTokensPurchased),
          totalUsed: TokenWalletService.formatTokens(wallet.totalTokensUsed),
        },
        recentTransactions: history.transactions,
      },
    });
  }
);

export const getTokenPackagesEndpoint = asyncHandler(
  async (_req: Request, res: Response) => {
    res.json({ success: true, data: TOKEN_PACKAGES });
  }
);

export const getTokenHistory = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

    const result = await TokenWalletService.getTransactionHistory(req.user.userId, limit, page);

    res.json({ success: true, data: result });
  }
);

export const allocateTokensToMember = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { toUserId, tokens } = req.body;
    if (!toUserId || !tokens || parseInt(tokens) <= 0) {
      throw new AppError('toUserId and positive tokens are required', 400);
    }

    const fromUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!fromUser?.organizationId) throw new AppError('Must be part of an organization', 400);

    if (!['org_owner', 'manager', 'platform_admin'].includes(fromUser.role)) {
      throw new AppError('Only owners and managers can allocate tokens', 403);
    }

    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
    if (!toUser) throw new AppError('Target user not found', 404);
    if (toUser.organizationId !== fromUser.organizationId) {
      throw new AppError('Can only allocate within your organization', 403);
    }
    if (fromUser.role === 'manager' && toUser.managerId !== fromUser.id) {
      throw new AppError('Managers can only allocate to their direct reports', 403);
    }

    const parsedTokens = parseInt(tokens);

    await TokenWalletService.allocateTokens({
      fromUserId: req.user.userId,
      toUserId,
      tokens: parsedTokens,
      organizationId: fromUser.organizationId,
    });

    res.json({
      success: true,
      message: `${TokenWalletService.formatTokens(parsedTokens)} tokens allocated successfully`,
    });
  }
);

// DEV ONLY — Add tokens without Stripe (for testing)
export const devAddTokens = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Not available', 404);
    }

    const { tokens } = req.body;
    if (!tokens || parseInt(tokens) <= 0) {
      throw new AppError('Invalid token amount', 400);
    }

    const parsedTokens = parseInt(tokens);

    await TokenWalletService.addTokens({
      userId: req.user.userId,
      tokens: parsedTokens,
      reference: `dev_${Date.now()}`,
      description: 'Development token addition',
    });

    const balance = await TokenWalletService.getBalance(req.user.userId);

    res.json({
      success: true,
      data: {
        tokensAdded: parsedTokens,
        newBalance: balance.tokenBalance,
        formatted: TokenWalletService.formatTokens(balance.tokenBalance),
      },
    });
  }
);
