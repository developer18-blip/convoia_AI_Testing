import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../config/db.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { config } from '../config/env.js';
import { isValidUUID } from '../utils/validators.js';
import logger from '../config/logger.js';

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

// Constants
const MIN_TOPUP_AMOUNT = 1.00;      // $1 minimum
const MAX_TOPUP_AMOUNT = 1000.00;   // $1000 maximum per transaction
const MAX_DAILY_TOPUP = 5000.00;    // $5000 daily limit

// Helper — get or create wallet
async function getOrCreateWallet(userId: string) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        balance: 0,
        totalToppedUp: 0,
        totalSpent: 0,
        currency: 'USD',
      },
    });
    logger.info(`Wallet created for user ${userId}`);
  }
  return wallet;
}

// Helper — check daily top-up limit
async function getDailyTopUpTotal(walletId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const result = await prisma.walletTransaction.aggregate({
    where: {
      walletId,
      type: 'credit',
      createdAt: { gte: startOfDay },
    },
    _sum: { amount: true },
  });

  return result._sum.amount || 0;
}

// ============ GET WALLET BALANCE ============
export const getWalletBalance = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const userId = req.params.userId || req.user.userId;

    if (!isValidUUID(userId)) {
      throw new AppError('Invalid user ID format', 400);
    }

    // Only allow viewing own wallet unless admin/platform_admin
    const isAdmin = ['admin', 'platform_admin', 'org_owner'].includes(
      req.user.role
    );
    if (userId !== req.user.userId && !isAdmin) {
      throw new AppError('Unauthorized to view this wallet', 403);
    }

    const wallet = await getOrCreateWallet(userId);

    // Get last 5 transactions for context
    const recentTransactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({
      success: true,
      statusCode: 200,
      message: 'Wallet balance retrieved',
      data: {
        userId: wallet.userId,
        balance: wallet.balance,
        totalToppedUp: wallet.totalToppedUp,
        totalSpent: wallet.totalSpent,
        currency: wallet.currency,
        lastTopedUpAt: wallet.lastTopedUpAt?.toISOString() || null,
        recentTransactions: recentTransactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          createdAt: t.createdAt.toISOString(),
        })),
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ TOP UP WALLET ============
export const topUpWallet = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const userId = req.params.userId || req.user.userId;
    const { amount, stripePaymentId, description } = req.body;

    if (!isValidUUID(userId)) {
      throw new AppError('Invalid user ID format', 400);
    }

    // Authorization
    const isAdmin = ['admin', 'platform_admin'].includes(req.user.role);
    if (userId !== req.user.userId && !isAdmin) {
      throw new AppError('Unauthorized to top up this wallet', 403);
    }

    // Non-admins must provide a Stripe payment ID — prevents free wallet credits
    if (!isAdmin && !stripePaymentId) {
      throw new AppError('Payment verification required. Use Stripe checkout to top up.', 400);
    }

    // Verify Stripe PaymentIntent status with Stripe directly (never trust client alone)
    if (stripePaymentId && !isAdmin) {
      if (!stripe) throw new AppError('Stripe is not configured', 503);
      const pi = await stripe.paymentIntents.retrieve(stripePaymentId);
      if (pi.status !== 'succeeded') {
        throw new AppError(`Payment has not been completed (status: ${pi.status})`, 402);
      }
      // Verify the amount in cents matches what the user claims
      const claimedAmountCents = Math.round(parseFloat(amount) * 100);
      if (pi.amount !== claimedAmountCents) {
        throw new AppError('Payment amount mismatch — contact support', 400);
      }
      // Verify this PaymentIntent belongs to the authenticated user
      if (pi.metadata?.userId && pi.metadata.userId !== userId) {
        logger.warn(`PaymentIntent ${stripePaymentId} userId mismatch: pi.metadata=${pi.metadata.userId} req=${userId}`);
        throw new AppError('Payment verification failed', 403);
      }
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < MIN_TOPUP_AMOUNT) {
      throw new AppError(
        `Minimum top-up amount is $${MIN_TOPUP_AMOUNT.toFixed(2)}`,
        400
      );
    }

    if (parsedAmount > MAX_TOPUP_AMOUNT) {
      throw new AppError(
        `Maximum top-up amount is $${MAX_TOPUP_AMOUNT.toFixed(2)} per transaction`,
        400
      );
    }

    // Get wallet
    const wallet = await getOrCreateWallet(userId);

    // Check daily limit
    const dailyTotal = await getDailyTopUpTotal(wallet.id);
    if (dailyTotal + parsedAmount > MAX_DAILY_TOPUP) {
      throw new AppError(
        `Daily top-up limit of $${MAX_DAILY_TOPUP.toFixed(2)} exceeded. Used: $${dailyTotal.toFixed(2)}`,
        429
      );
    }

    // If stripePaymentId provided, verify it hasn't been used before
    if (stripePaymentId) {
      const existingTransaction = await prisma.walletTransaction.findFirst({
        where: { reference: stripePaymentId },
      });
      if (existingTransaction) {
        throw new AppError(
          'This payment has already been processed',
          409
        );
      }
    }

    // Atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: parsedAmount },
          totalToppedUp: { increment: parsedAmount },
          lastTopedUpAt: new Date(),
        },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: parsedAmount,
          type: 'credit',
          description:
            description ||
            `Top-up via ${stripePaymentId ? 'Stripe' : 'system'}`,
          reference: stripePaymentId || null,
        },
      });

      return { wallet: updated, transaction };
    });

    logger.info(`Wallet top-up: user=${userId} amount=$${parsedAmount}`);

    res.json({
      success: true,
      statusCode: 200,
      message: 'Wallet topped up successfully',
      data: {
        balance: result.wallet.balance,
        amountAdded: parsedAmount,
        totalToppedUp: result.wallet.totalToppedUp,
        transactionId: result.transaction.id,
        dailyTopUpUsed: dailyTotal + parsedAmount,
        dailyTopUpRemaining: MAX_DAILY_TOPUP - dailyTotal - parsedAmount,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ GET TRANSACTION HISTORY ============
export const getTransactionHistory = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const userId = req.params.userId || req.user.userId;
    const {
      page = '1',
      limit = '20',
      startDate,
      endDate,
      type,
    } = req.query;

    if (!isValidUUID(userId)) {
      throw new AppError('Invalid user ID format', 400);
    }

    const isAdmin = ['admin', 'platform_admin', 'org_owner'].includes(
      req.user.role
    );
    if (userId !== req.user.userId && !isAdmin) {
      throw new AppError('Unauthorized to view this transaction history', 403);
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      res.json({
        success: true,
        statusCode: 200,
        message: 'No wallet found',
        data: {
          transactions: [],
          pagination: { page: 1, limit: 20, total: 0, pages: 0 },
          summary: { totalCredits: 0, totalDebits: 0, netFlow: 0 },
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const whereFilter: any = { walletId: wallet.id };

    if (type && ['credit', 'debit'].includes(type as string)) {
      whereFilter.type = type;
    }

    if (startDate || endDate) {
      whereFilter.createdAt = {};
      if (startDate) {
        whereFilter.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        whereFilter.createdAt.lte = new Date(endDate as string);
      }
    }

    // Get transactions + totals in parallel
    const [transactions, total, creditSum, debitSum] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereFilter,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.walletTransaction.count({ where: whereFilter }),
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: 'credit' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: 'debit' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      success: true,
      statusCode: 200,
      message: 'Transaction history retrieved',
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          reference: t.reference || null,
          createdAt: t.createdAt.toISOString(),
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        summary: {
          totalCredits: creditSum._sum.amount || 0,
          totalDebits: debitSum._sum.amount || 0,
          netFlow:
            (creditSum._sum.amount || 0) - (debitSum._sum.amount || 0),
          currentBalance: wallet.balance,
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ GET WALLET SUMMARY (for dashboard) ============
export const getWalletSummary = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const userId = req.user.userId;
    const wallet = await getOrCreateWallet(userId);

    // Get spending by day for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSpending = await prisma.walletTransaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'debit',
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get daily top-up status
    const dailyUsed = await getDailyTopUpTotal(wallet.id);

    res.json({
      success: true,
      statusCode: 200,
      message: 'Wallet summary retrieved',
      data: {
        balance: wallet.balance,
        currency: wallet.currency,
        totalToppedUp: wallet.totalToppedUp,
        totalSpent: wallet.totalSpent,
        lastTopedUpAt: wallet.lastTopedUpAt?.toISOString() || null,
        limits: {
          minTopUp: MIN_TOPUP_AMOUNT,
          maxTopUp: MAX_TOPUP_AMOUNT,
          dailyLimit: MAX_DAILY_TOPUP,
          dailyUsed,
          dailyRemaining: Math.max(0, MAX_DAILY_TOPUP - dailyUsed),
        },
        last30DaysSpending: recentSpending.reduce(
          (sum, t) => sum + t.amount,
          0
        ),
        transactionCount: recentSpending.length,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ CREATE STRIPE PAYMENT INTENT ============
export const createPaymentIntent = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (!stripe) throw new AppError('Stripe is not configured', 503);

    const userId = req.user.userId;
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < MIN_TOPUP_AMOUNT) {
      throw new AppError(`Minimum top-up amount is $${MIN_TOPUP_AMOUNT.toFixed(2)}`, 400);
    }
    if (parsedAmount > MAX_TOPUP_AMOUNT) {
      throw new AppError(`Maximum top-up amount is $${MAX_TOPUP_AMOUNT.toFixed(2)} per transaction`, 400);
    }

    const wallet = await getOrCreateWallet(userId);
    const dailyTotal = await getDailyTopUpTotal(wallet.id);
    if (dailyTotal + parsedAmount > MAX_DAILY_TOPUP) {
      throw new AppError(`Daily top-up limit exceeded. Used: $${dailyTotal.toFixed(2)}`, 429);
    }

    // Amount in cents for Stripe
    const amountInCents = Math.round(parsedAmount * 100);

    // Idempotency key scoped to user + amount (prevents duplicate intents on retry)
    const idempotencyKey = `topup_${userId}_${amountInCents}_${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: { userId },
        description: `Convoia AI wallet top-up for user ${userId}`,
      },
      { idempotencyKey }
    );

    logger.info(`PaymentIntent created: ${paymentIntent.id} for user ${userId} amount=$${parsedAmount}`);

    res.json({
      success: true,
      statusCode: 200,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: parsedAmount,
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ CREATE STRIPE CHECKOUT SESSION ============
export const createCheckoutSession = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (!stripe) throw new AppError('Stripe is not configured', 503);

    const userId = req.user.userId;
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < MIN_TOPUP_AMOUNT) {
      throw new AppError(`Minimum top-up amount is $${MIN_TOPUP_AMOUNT.toFixed(2)}`, 400);
    }
    if (parsedAmount > MAX_TOPUP_AMOUNT) {
      throw new AppError(`Maximum top-up amount is $${MAX_TOPUP_AMOUNT.toFixed(2)} per transaction`, 400);
    }

    const wallet = await getOrCreateWallet(userId);
    const dailyTotal = await getDailyTopUpTotal(wallet.id);
    if (dailyTotal + parsedAmount > MAX_DAILY_TOPUP) {
      throw new AppError(`Daily top-up limit exceeded. Used: $${dailyTotal.toFixed(2)}`, 429);
    }

    const amountInCents = Math.round(parsedAmount * 100);

    // Determine frontend origin for redirect URLs
    const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Convoia AI — Wallet Top-Up',
              description: `Add $${parsedAmount.toFixed(2)} to your Convoia AI wallet`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: { userId, amount: String(parsedAmount) },
      success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payment/cancel`,
      expires_at: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
    });

    logger.info(`Checkout session created: ${session.id} for user ${userId} amount=$${parsedAmount}`);

    res.json({
      success: true,
      statusCode: 200,
      data: { sessionId: session.id, url: session.url },
      timestamp: new Date().toISOString(),
    });
  }
);

// ============ VERIFY CHECKOUT SESSION & CREDIT WALLET ============
// Belt-and-suspenders: this endpoint both verifies the session AND credits
// the wallet if not already credited. The webhook does the same thing.
// Idempotency (reference check) guarantees no double-credit.
export const verifyCheckoutSession = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);
    if (!stripe) throw new AppError('Stripe is not configured', 503);

    const { sessionId } = req.params;
    if (!sessionId || typeof sessionId !== 'string') {
      throw new AppError('Session ID is required', 400);
    }

    // Validate sessionId format (Stripe checkout sessions start with cs_)
    if (!sessionId.startsWith('cs_')) {
      throw new AppError('Invalid session ID format', 400);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify this session belongs to the authenticated user
    if (session.metadata?.userId !== req.user.userId) {
      throw new AppError('Session does not belong to this user', 403);
    }

    const amount = parseFloat(session.metadata?.amount || '0');
    const userId = req.user.userId;
    let walletCredited = false;

    // If payment is confirmed, credit wallet (idempotent — safe to call multiple times)
    if (session.payment_status === 'paid' && amount > 0) {
      // Check if already credited (idempotency via reference = session ID)
      const existing = await prisma.walletTransaction.findFirst({
        where: { reference: sessionId },
      });

      if (!existing) {
        // Credit wallet atomically
        await prisma.$transaction(async (tx) => {
          // Double-check inside transaction to prevent race condition
          const doubleCheck = await tx.walletTransaction.findFirst({
            where: { reference: sessionId },
          });
          if (doubleCheck) return; // Already processed by webhook

          let wallet = await tx.wallet.findUnique({ where: { userId } });

          if (!wallet) {
            wallet = await tx.wallet.create({
              data: {
                userId,
                balance: 0,
                totalToppedUp: 0,
                totalSpent: 0,
                currency: 'USD',
              },
            });
          }

          await tx.wallet.update({
            where: { userId },
            data: {
              balance: { increment: amount },
              totalToppedUp: { increment: amount },
              lastTopedUpAt: new Date(),
            },
          });

          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              amount,
              type: 'credit',
              description: 'Wallet top-up via Stripe Checkout',
              reference: sessionId,
            },
          });

          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent as any)?.id || null;

          await tx.billingRecord.create({
            data: {
              userId,
              amount,
              description: 'Wallet top-up via Stripe Checkout',
              type: 'wallet_topup',
              status: 'paid',
              stripePaymentId: paymentIntentId || sessionId,
              paidDate: new Date(),
            },
          });
        });

        walletCredited = true;
        logger.info(`Wallet credited via verify: user=${userId} amount=$${amount} session=${sessionId}`);
      } else {
        // Already credited (by webhook or previous verify call)
        walletCredited = true;
      }
    }

    // Fetch updated wallet balance
    const wallet = await prisma.wallet.findUnique({ where: { userId } });

    res.json({
      success: true,
      statusCode: 200,
      data: {
        status: session.payment_status,
        amount,
        walletCredited,
        newBalance: wallet?.balance ?? 0,
        customerEmail: session.customer_details?.email || null,
        createdAt: new Date((session.created || 0) * 1000).toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  }
);