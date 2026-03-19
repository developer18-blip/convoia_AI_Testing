import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { StripeService, PLAN_CONFIG } from '../services/stripeService.js';
import type { PlanKey } from '../services/stripeService.js';

const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey)
  : null;

/**
 * Handle Stripe webhook events.
 * IMPORTANT: This endpoint must receive the raw body (not JSON-parsed)
 * for signature verification to work. See stripeRoutes.ts for setup.
 */
export const handleStripeWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!stripe || !config.stripeWebhookSecret) {
    logger.error('Stripe is not configured — webhook rejected');
    res.status(503).json({ error: 'Stripe not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body buffer
      sig,
      config.stripeWebhookSecret
    );
  } catch (err: any) {
    logger.error(`Stripe signature verification failed: ${err.message}`);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  logger.info(`Stripe event received: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      // ---- Checkout session completed (Stripe-hosted checkout) ----
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      // ---- Checkout session expired ----
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info(`Checkout session expired: ${session.id} user=${session.metadata?.userId}`);
        break;
      }

      // ---- One-time payment succeeded (wallet top-up via Elements) ----
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      // ---- Subscription created ----
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        break;
      }

      // ---- Subscription updated (plan change, renewal) ----
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      // ---- Subscription cancelled or expired ----
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      // ---- Invoice paid (recurring payment) ----
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      // ---- Payment failed ----
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (err: any) {
    logger.error(`Error processing Stripe event ${event.type}: ${err.message}`);
    // Return 200 so Stripe doesn't retry — we logged the error
    res.status(200).json({ received: true, error: err.message });
    return;
  }

  res.status(200).json({ received: true });
};

// ============ HANDLERS ============

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.userId;
  if (!userId) {
    logger.warn(`Checkout session ${session.id} has no userId in metadata — skipping`);
    return;
  }

  // ── Subscription checkout ──
  if (session.mode === 'subscription') {
    await handleSubscriptionCheckoutCompleted(session);
    return;
  }

  // ── One-time payment (wallet top-up) ──
  if (session.payment_status !== 'paid') {
    logger.info(`Checkout session ${session.id} payment_status=${session.payment_status} — skipping`);
    return;
  }

  const amount = parseFloat(session.metadata?.amount || '0');
  if (amount <= 0) {
    logger.warn(`Checkout session ${session.id} has invalid amount — skipping`);
    return;
  }

  // Idempotency: check if this session was already processed
  const existing = await prisma.walletTransaction.findFirst({
    where: { reference: session.id },
  });
  if (existing) {
    logger.info(`Checkout session ${session.id} already processed — skipping`);
    return;
  }

  // Credit wallet atomically
  await prisma.$transaction(async (tx) => {
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
        description: `Wallet top-up via Stripe Checkout`,
        reference: session.id,
      },
    });

    // Extract paymentIntent ID for billing record
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id || null;

    await tx.billingRecord.create({
      data: {
        userId,
        amount,
        description: `Wallet top-up via Stripe Checkout`,
        type: 'wallet_topup',
        status: 'paid',
        stripePaymentId: paymentIntentId || session.id,
        paidDate: new Date(),
      },
    });
  });

  // Send receipt email (fire-and-forget)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (user && wallet) {
    StripeService.sendTopUpReceipt({
      userEmail: user.email,
      userName: user.name,
      amount,
      newBalance: wallet.balance,
      transactionId: session.id,
    }).catch(() => {});
  }

  logger.info(
    `Wallet topped up via Checkout: user=${userId} amount=$${amount} session=${session.id}`
  );
}

/**
 * Handle subscription checkout.session.completed.
 * Creates/updates the subscription record and org tier, sends confirmation email.
 */
async function handleSubscriptionCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.userId;
  const organizationId = session.metadata?.organizationId;
  const plan = session.metadata?.plan as PlanKey | undefined;

  if (!userId || !organizationId || !plan) {
    logger.warn(`Subscription checkout ${session.id} missing metadata — skipping`);
    return;
  }

  const planConfig = PLAN_CONFIG[plan];
  if (!planConfig) {
    logger.warn(`Unknown plan "${plan}" in checkout ${session.id}`);
    return;
  }

  const stripeSubId = session.subscription as string;
  let renewalDate: Date | null = null;

  if (stripeSubId && stripe) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
      const periodEnd = (stripeSub as any).current_period_end as number | undefined;
      if (periodEnd) {
        renewalDate = new Date(periodEnd * 1000);
      }
    } catch (err) {
      logger.warn(`Could not retrieve subscription ${stripeSubId}: ${err}`);
    }
  }

  // Upsert subscription record
  const existingSub = await prisma.subscription.findFirst({
    where: { userId, organizationId },
  });

  if (existingSub) {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        plan,
        status: 'active',
        monthlyTokenQuota: planConfig.monthlyTokens,
        tokensUsedThisMonth: 0,
        stripeSubscriptionId: stripeSubId,
        stripePriceId: planConfig.priceId,
        renewalDate,
        quotaResetDate: renewalDate ?? new Date(),
      },
    });
  } else {
    await prisma.subscription.create({
      data: {
        userId,
        organizationId,
        plan,
        status: 'active',
        monthlyTokenQuota: planConfig.monthlyTokens,
        tokensUsedThisMonth: 0,
        stripeSubscriptionId: stripeSubId,
        stripePriceId: planConfig.priceId,
        renewalDate,
        quotaResetDate: renewalDate ?? new Date(),
        startDate: new Date(),
      },
    });
  }

  // Update org tier
  await prisma.organization.update({
    where: { id: organizationId },
    data: { tier: plan },
  });

  // Send confirmation email (fire-and-forget)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && renewalDate) {
    StripeService.sendSubscriptionEmail({
      userEmail: user.email,
      userName: user.name,
      plan: planConfig.name,
      amount: planConfig.price,
      nextBillingDate: renewalDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    }).catch(() => {});
  }

  logger.info(
    `Subscription activated via Checkout: org=${organizationId} plan=${plan} stripe=${stripeSubId}`
  );
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent
) {
  const userId = paymentIntent.metadata?.userId;
  if (!userId) {
    logger.warn(
      `PaymentIntent ${paymentIntent.id} has no userId in metadata — skipping`
    );
    return;
  }

  // Amount is in cents
  const amount = paymentIntent.amount / 100;

  // Idempotency: check if this payment was already processed
  const existing = await prisma.walletTransaction.findFirst({
    where: { reference: paymentIntent.id },
  });
  if (existing) {
    logger.info(
      `PaymentIntent ${paymentIntent.id} already processed — skipping`
    );
    return;
  }

  // Get or create wallet, then credit it
  await prisma.$transaction(async (tx) => {
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
        description: `Stripe payment: ${paymentIntent.id}`,
        reference: paymentIntent.id,
      },
    });

    await tx.billingRecord.create({
      data: {
        userId,
        amount,
        description: `Wallet top-up via Stripe`,
        type: 'wallet_topup',
        status: 'paid',
        stripePaymentId: paymentIntent.id,
        paidDate: new Date(),
      },
    });
  });

  // Send receipt email (fire-and-forget)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (user && wallet) {
    StripeService.sendTopUpReceipt({
      userEmail: user.email,
      userName: user.name,
      amount,
      newBalance: wallet.balance,
      transactionId: paymentIntent.id,
    }).catch(() => {});
  }

  logger.info(
    `Wallet topped up: user=${userId} amount=$${amount} stripe=${paymentIntent.id}`
  );
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    logger.warn(
      `Subscription ${subscription.id} has no userId in metadata — skipping`
    );
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id || null;

  // Determine plan and quota from metadata or price
  const plan = subscription.metadata?.plan || 'pro';
  const monthlyTokenQuota = parseInt(
    subscription.metadata?.monthlyTokenQuota || '5000000',
    10
  );

  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    update: {
      status: subscription.status === 'active' ? 'active' : 'pending',
      plan,
      monthlyTokenQuota,
      stripePriceId: priceId,
    },
    create: {
      userId,
      plan,
      status: subscription.status === 'active' ? 'active' : 'pending',
      monthlyTokenQuota,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      quotaResetDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        1
      ),
    },
  });

  logger.info(
    `Subscription created: user=${userId} plan=${plan} stripe=${subscription.id}`
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!existing) {
    logger.warn(
      `Subscription ${subscription.id} not found in DB — cannot update`
    );
    return;
  }

  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'suspended',
  };

  // current_period_end may be on the subscription object depending on Stripe API version
  const periodEnd = (subscription as any).current_period_end as number | undefined;

  await prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: statusMap[subscription.status] || subscription.status,
      renewalDate: periodEnd ? new Date(periodEnd * 1000) : undefined,
    },
  });

  logger.info(
    `Subscription updated: stripe=${subscription.id} status=${subscription.status}`
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: 'cancelled',
      endDate: new Date(),
    },
  });

  logger.info(`Subscription cancelled: stripe=${subscription.id}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Stripe v20+ moved subscription to parent; raw event data still has it
  const invoiceData = invoice as any;
  const subscriptionId: string | null =
    invoiceData.subscription || invoiceData.parent?.subscription_details?.subscription || null;

  if (!subscriptionId) return;

  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!sub) return;

  const amount = (invoice.amount_paid || 0) / 100;
  const paymentIntentId: string | null = invoiceData.payment_intent || null;

  await prisma.billingRecord.create({
    data: {
      userId: sub.userId,
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      amount,
      description: `Subscription payment — ${sub.plan} plan`,
      type: 'subscription',
      status: 'paid',
      stripePaymentId: paymentIntentId || undefined,
      invoiceNumber: invoice.number || undefined,
      paidDate: new Date(),
    },
  });

  // Reset token quota on successful renewal
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      tokensUsedThisMonth: 0,
      quotaResetDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        1
      ),
    },
  });

  logger.info(
    `Invoice paid: user=${sub.userId} amount=$${amount} invoice=${invoice.id}`
  );
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const invoiceData = invoice as any;
  const subscriptionId: string | null =
    invoiceData.subscription || invoiceData.parent?.subscription_details?.subscription || null;

  if (!subscriptionId) return;

  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!sub) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'past_due' },
  });

  logger.warn(
    `Payment failed: user=${sub.userId} subscription=${subscriptionId} invoice=${invoice.id}`
  );
}
