import { Request, Response } from 'express';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { StripeService, PLAN_CONFIG } from '../services/stripeService.js';
import type { PlanKey } from '../services/stripeService.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

// ─── Create Checkout Session for subscription ────────────────────────────────
export const createSubscriptionCheckout = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const { plan } = req.body;

    if (!plan || !['starter', 'pro', 'business'].includes(plan)) {
      throw new AppError('Invalid plan. Must be starter, pro, or business.', 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    if (!user) throw new AppError('User not found', 404);

    if (user.role !== 'org_owner' && user.role !== 'platform_admin') {
      throw new AppError('Only organization owners can manage subscriptions', 403);
    }

    if (!user.organizationId) {
      throw new AppError('You must create an organization first', 400);
    }

    const result = await StripeService.createSubscriptionCheckout({
      userId: user.id,
      organizationId: user.organizationId,
      plan: plan as PlanKey,
    });

    res.json({
      success: true,
      statusCode: 200,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Create Customer Portal session ──────────────────────────────────────────
export const createPortalSession = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const result = await StripeService.createPortalSession({
      userId: req.user.userId,
    });

    res.json({
      success: true,
      statusCode: 200,
      data: result,
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Get subscription status ─────────────────────────────────────────────────
export const getSubscriptionStatus = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['active', 'past_due'] } },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!user) throw new AppError('User not found', 404);

    const subscription = user.organization?.subscriptions[0] ?? null;

    const planKey = (subscription?.plan || 'free') as PlanKey | 'free';
    const planConfig =
      planKey !== 'free' && planKey in PLAN_CONFIG
        ? PLAN_CONFIG[planKey as PlanKey]
        : null;

    res.json({
      success: true,
      statusCode: 200,
      data: {
        plan: subscription?.plan ?? 'free',
        status: subscription?.status ?? 'inactive',
        monthlyTokenQuota: subscription?.monthlyTokenQuota ?? 0,
        tokensUsedThisMonth: subscription?.tokensUsedThisMonth ?? 0,
        tokensRemaining: subscription
          ? subscription.monthlyTokenQuota - subscription.tokensUsedThisMonth
          : 0,
        percentUsed: subscription?.monthlyTokenQuota
          ? Math.round(
              (subscription.tokensUsedThisMonth /
                subscription.monthlyTokenQuota) *
                100
            )
          : 0,
        renewalDate: subscription?.renewalDate ?? null,
        stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
        planPrice: planConfig?.price ?? 0,
        planName: planConfig?.name ?? 'Free',
      },
      timestamp: new Date().toISOString(),
    });
  }
);

// ─── Cancel subscription ─────────────────────────────────────────────────────
export const cancelSubscription = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw new AppError('Unauthorized', 401);

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        organization: {
          include: {
            subscriptions: {
              where: { status: 'active' },
              take: 1,
            },
          },
        },
      },
    });

    if (user?.role !== 'org_owner' && user?.role !== 'platform_admin') {
      throw new AppError('Only org owners can cancel subscriptions', 403);
    }

    const subscription = user.organization?.subscriptions[0];
    if (!subscription?.stripeSubscriptionId) {
      throw new AppError('No active subscription found', 404);
    }

    await StripeService.cancelSubscription(subscription.stripeSubscriptionId);

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'cancelled' },
    });

    logger.info(
      `Subscription cancelled: user=${req.user.userId} stripe=${subscription.stripeSubscriptionId}`
    );

    res.json({
      success: true,
      statusCode: 200,
      message: 'Subscription will cancel at end of billing period',
      timestamp: new Date().toISOString(),
    });
  }
);
