import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { EmailService } from '../services/emailService.js';
import { TokenWalletService } from '../services/tokenWalletService.js';

const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey)
  : null;

/**
 * Handle Stripe webhook events.
 * Single billing system: token packages only.
 * IMPORTANT: This endpoint must receive the raw body (not JSON-parsed)
 * for signature verification to work.
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
      // Token purchase checkout completed
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info(`=== CHECKOUT SESSION COMPLETED === id=${session.id} status=${session.payment_status}`);
        await handleTokenPurchaseCompleted(session);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info(`Checkout session expired: ${session.id} user=${session.metadata?.userId}`);
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

/**
 * Handle token purchase checkout.session.completed.
 * Credits tokens to the user's token wallet.
 */
async function handleTokenPurchaseCompleted(
  session: Stripe.Checkout.Session
) {
  if (session.payment_status !== 'paid') {
    logger.info(`Token purchase ${session.id} not paid — skipping`);
    return;
  }

  const userId = session.metadata?.userId;
  const organizationId = session.metadata?.organizationId || undefined;
  const tokens = parseInt(session.metadata?.tokens || '0', 10);
  const packageId = session.metadata?.packageId || 'unknown';
  const packageName = session.metadata?.packageName || 'Token Purchase';
  const amount = parseFloat(session.metadata?.amount || '0');

  if (!userId || tokens <= 0) {
    logger.warn(`Token purchase ${session.id} missing metadata — skipping`);
    return;
  }

  // Idempotency
  const existing = await prisma.tokenPurchase.findFirst({
    where: { stripePaymentId: session.id },
  }).catch(() => null);
  if (existing) {
    logger.info(`Token purchase ${session.id} already processed — skipping`);
    return;
  }

  // Record purchase
  await prisma.tokenPurchase.create({
    data: {
      userId,
      organizationId: organizationId || null,
      packageId,
      packageName,
      tokensPurchased: tokens,
      amountPaid: amount,
      stripePaymentId: session.id,
      expiresAt: null, // never expires
    },
  });

  // Credit tokens to user's wallet
  await TokenWalletService.addTokens({
    userId,
    tokens,
    reference: session.id,
    description: `Purchased ${packageName} (${TokenWalletService.formatTokens(tokens)} tokens)`,
    organizationId,
  });

  // Create billing record
  await prisma.billingRecord.create({
    data: {
      userId,
      organizationId: organizationId || null,
      amount,
      description: `Token purchase — ${packageName}`,
      type: 'token_purchase',
      status: 'paid',
      stripePaymentId: session.id,
      paidDate: new Date(),
    },
  });

  // Send receipt email
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    EmailService.sendTokenPurchaseReceipt({
      ownerEmail: user.email,
      ownerName: user.name,
      orgName: organizationId ? (await prisma.organization.findUnique({ where: { id: organizationId } }))?.name || '' : '',
      amount,
      tokensReceived: tokens,
      transactionId: session.id,
    }).catch(() => {});
  }

  // Log activity
  if (organizationId) {
    try {
      await prisma.activityLog.create({
        data: {
          organizationId,
          actorId: userId,
          action: 'tokens_purchased',
          details: { tokens, amount, packageName },
        },
      });
    } catch { /* optional */ }
  }

  logger.info(`Token purchase completed: userId=${userId} tokens=${tokens} package=${packageName}`);
}
