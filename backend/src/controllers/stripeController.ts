import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { StripeService, stripe } from '../services/stripeService.js';
import { TOKEN_PACKAGES } from '../config/tokenPackages.js';
import { TokenWalletService } from '../services/tokenWalletService.js';
import { NotificationService } from '../services/notificationService.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

// ─── Get available token packages ────────────────────────────────────────────
export const getTokenPackages = asyncHandler(
  async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: TOKEN_PACKAGES,
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Purchase tokens (create Stripe checkout) ───────────────────────────────
// Only org_owner and freelancers (no org) can purchase tokens.
// Employees/managers receive tokens via allocation from their owner.
export const purchaseTokens = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { packageId } = req.body;
    if (!packageId) throw new AppError('packageId is required', 400);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    if (!user) throw new AppError('User not found', 404);

    // Role check: only org_owner, platform_admin, or freelancers (no org) can buy
    const canPurchase = !user.organizationId || user.role === 'org_owner' || user.role === 'platform_admin';
    if (!canPurchase) {
      throw new AppError('Only organization owners or individual users can purchase tokens. Ask your manager to allocate tokens.', 403);
    }

    const result = await StripeService.createTokenCheckout({
      userId: user.id,
      packageId,
      organizationId: user.organizationId || undefined,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Get token pool status (org owner) ───────────────────────────────────────
export const getTokenPoolStatus = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { organization: true },
    });
    if (!user || !user.organizationId) {
      throw new AppError('Not part of an organization', 400);
    }

    const pool = await prisma.tokenPool.findUnique({
      where: { organizationId: user.organizationId },
    });

    const purchases = await prisma.tokenPurchase.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      success: true,
      data: {
        pool: pool || { totalTokens: 0, allocatedTokens: 0, usedTokens: 0, availableTokens: 0 },
        purchases,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Verify checkout session & credit tokens (belt-and-suspenders) ───────────
// This endpoint is called by the frontend after Stripe redirect.
// It verifies the session with Stripe AND credits tokens if not already done.
// This ensures tokens are credited even if the webhook hasn't arrived yet.
export const verifyAndCreditSession = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (!stripe) throw new AppError('Stripe is not configured', 503);

    const { sessionId } = req.params;
    if (!sessionId || !sessionId.startsWith('cs_')) {
      throw new AppError('Invalid session ID', 400);
    }

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify ownership
    if (session.metadata?.userId !== req.user.userId) {
      throw new AppError('Session does not belong to this user', 403);
    }

    if (session.payment_status !== 'paid') {
      res.json({
        success: true,
        data: { credited: false, status: session.payment_status },
      });
      return;
    }

    const tokens = parseInt(session.metadata?.tokens || '0', 10);
    const packageName = session.metadata?.packageName || 'Token Purchase';
    const amount = parseFloat(session.metadata?.amount || '0');
    const organizationId = session.metadata?.organizationId || undefined;

    if (tokens <= 0) {
      throw new AppError('Invalid token amount in session', 400);
    }

    // Idempotency — check if already credited
    const existing = await prisma.tokenPurchase.findFirst({
      where: { stripePaymentId: sessionId },
    }).catch(() => null);

    let credited = false;

    if (!existing) {
      // Credit tokens — same logic as webhook handler
      await prisma.tokenPurchase.create({
        data: {
          userId: req.user.userId,
          organizationId: organizationId || null,
          packageId: session.metadata?.packageId || 'unknown',
          packageName,
          tokensPurchased: tokens,
          amountPaid: amount,
          stripePaymentId: sessionId,
          expiresAt: null,
        },
      });

      await TokenWalletService.addTokens({
        userId: req.user.userId,
        tokens,
        reference: sessionId,
        description: `Purchased ${packageName} (${TokenWalletService.formatTokens(tokens)} tokens)`,
        organizationId,
      });

      // Notify user of purchase (fire and forget)
      NotificationService.onTokenPurchase(req.user.userId, tokens).catch(() => {});

      await prisma.billingRecord.create({
        data: {
          userId: req.user.userId,
          organizationId: organizationId || null,
          amount,
          description: `Token purchase — ${packageName}`,
          type: 'token_purchase',
          status: 'paid',
          stripePaymentId: sessionId,
          paidDate: new Date(),
        },
      });

      credited = true;
      logger.info(`Tokens credited via verify: userId=${req.user.userId} tokens=${tokens} session=${sessionId}`);
    } else {
      credited = true; // already credited by webhook
      logger.info(`Session ${sessionId} already credited — skipping`);
    }

    // Return updated balance
    const balance = await TokenWalletService.getBalance(req.user.userId);

    res.json({
      success: true,
      data: {
        credited,
        tokens,
        packageName,
        newBalance: balance.tokenBalance,
        formatted: TokenWalletService.formatTokens(balance.tokenBalance),
      },
    });
  }
);
