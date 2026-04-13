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
    // Return 500 so Stripe retries the webhook. Transient DB failures
    // and wallet crediting errors must NOT be silently swallowed — if
    // we return 200 here, the event is gone forever and the user paid
    // without getting tokens.
    logger.error(`Error processing Stripe event ${event.type}: ${err.message}`, { stack: err.stack });
    res.status(500).json({ error: 'Processing failed, will retry' });
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
  // CHECK 1: Session payment status
  if (session.payment_status !== 'paid') {
    logger.info(`Token purchase ${session.id} not paid — skipping`);
    return;
  }

  // CHECK 2: Verify PaymentIntent actually succeeded
  if (stripe && session.payment_intent) {
    const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.status !== 'succeeded') {
      logger.error(`PaymentIntent ${piId} status=${pi.status} — NOT crediting tokens`);
      return;
    }

    // CHECK 3: Verify amount matches
    const expectedCents = Math.round(parseFloat(session.metadata?.amount || '0') * 100);
    if (pi.amount_received < expectedCents) {
      logger.error(`Amount mismatch: session=${session.id} paid=${pi.amount_received} expected=${expectedCents}`);
      return;
    }
    logger.info(`Payment verified: pi=${piId} status=succeeded amount=$${(pi.amount_received / 100).toFixed(2)}`);
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

  // Idempotency — fast path. DB errors are NOT swallowed: they bubble
  // up so the outer handler returns 500 and Stripe retries the webhook.
  const existing = await prisma.tokenPurchase.findUnique({
    where: { stripePaymentId: session.id },
  });
  if (existing) {
    logger.info(`Token purchase ${session.id} already processed — skipping`);
    return;
  }

  // Atomic credit: tokenPurchase + wallet + tokenTransaction + orgBalance
  // + billingRecord all succeed together or all roll back. The
  // @unique constraint on stripePaymentId is a hard safety net against
  // races between concurrent webhook deliveries — P2002 means another
  // delivery already processed this event.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.tokenPurchase.create({
        data: {
          userId,
          organizationId: organizationId || null,
          packageId,
          packageName,
          tokensPurchased: tokens,
          amountPaid: amount,
          stripePaymentId: session.id,
          expiresAt: null,
        },
      });

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

      await tx.tokenTransaction.create({
        data: {
          userId,
          type: 'purchase',
          tokens,
          balanceAfter: wallet.tokenBalance,
          description: `Purchased ${packageName} (${TokenWalletService.formatTokens(tokens)} tokens)`,
          reference: session.id,
        },
      });

      if (organizationId) {
        await tx.organization.update({
          where: { id: organizationId },
          data: { orgTokenBalance: { increment: tokens } },
        }).catch(() => { /* org may be missing for personal accounts */ });
      }

      await tx.billingRecord.create({
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
    }, { timeout: 15000 });
  } catch (err: any) {
    if (err.code === 'P2002') {
      logger.info(`Token purchase ${session.id} already processed (P2002 race) — treating as duplicate`);
      return;
    }
    throw err;
  }

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
