import Stripe from 'stripe';
import { Resend } from 'resend';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey)
  : null;

const resend = config.resendApiKey
  ? new Resend(config.resendApiKey)
  : null;

const PLAN_CONFIG = {
  starter: {
    priceId: config.stripeStarterPriceId || '',
    name: 'Starter',
    monthlyTokens: 500000,
    price: 9,
  },
  pro: {
    priceId: config.stripeProPriceId || '',
    name: 'Pro',
    monthlyTokens: 2000000,
    price: 29,
  },
  business: {
    priceId: config.stripeBusinessPriceId || '',
    name: 'Business',
    monthlyTokens: 10000000,
    price: 99,
  },
} as const;

type PlanKey = keyof typeof PLAN_CONFIG;

export class StripeService {
  /**
   * Get or create a Stripe customer for a user.
   * Looks up by email first, creates if not found.
   */
  static async getOrCreateCustomer(userId: string): Promise<string> {
    if (!stripe) throw new Error('Stripe is not configured');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new Error('User not found');

    // Search Stripe for existing customer by email
    const existing = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existing.data.length > 0) {
      return existing.data[0].id;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: user.id,
        organizationId: user.organizationId ?? '',
        role: user.role,
      },
    });

    logger.info(`Stripe customer created: ${customer.id} for user: ${userId}`);
    return customer.id;
  }

  /**
   * Create a PaymentIntent for wallet top-up.
   */
  static async createPaymentIntent(params: {
    userId: string;
    amount: number;
  }) {
    if (!stripe) throw new Error('Stripe is not configured');

    const { userId, amount } = params;
    if (amount < 1 || amount > 1000) {
      throw new Error('Amount must be between $1 and $1,000');
    }

    const customerId = await this.getOrCreateCustomer(userId);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      customer: customerId,
      metadata: {
        userId,
        type: 'wallet_topup',
        amount: amount.toString(),
      },
      automatic_payment_methods: { enabled: true },
      description: `Convoia AI Wallet Top-up — $${amount}`,
    });

    logger.info(`PaymentIntent created: ${paymentIntent.id} for $${amount}`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  /**
   * Create a Stripe Checkout Session for a subscription plan.
   */
  static async createSubscriptionCheckout(params: {
    userId: string;
    organizationId: string;
    plan: PlanKey;
  }) {
    if (!stripe) throw new Error('Stripe is not configured');

    const { userId, organizationId, plan } = params;
    const planConfig = PLAN_CONFIG[plan];
    if (!planConfig || !planConfig.priceId) {
      throw new Error(`Invalid or unconfigured plan: ${plan}`);
    }

    const customerId = await this.getOrCreateCustomer(userId);
    const frontendUrl = config.frontendUrl;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${frontendUrl}/org/billing?success=true&plan=${plan}`,
      cancel_url: `${frontendUrl}/org/billing?cancelled=true`,
      metadata: {
        userId,
        organizationId,
        plan,
        monthlyTokenQuota: String(planConfig.monthlyTokens),
      },
      subscription_data: {
        metadata: {
          userId,
          organizationId,
          plan,
          monthlyTokenQuota: String(planConfig.monthlyTokens),
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    logger.info(`Subscription checkout created: ${session.id} for plan: ${plan}`);
    return { checkoutUrl: session.url };
  }

  /**
   * Create a Stripe Customer Portal session for billing management.
   */
  static async createPortalSession(params: { userId: string }) {
    if (!stripe) throw new Error('Stripe is not configured');

    const customerId = await this.getOrCreateCustomer(params.userId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.frontendUrl}/org/billing`,
    });

    return { portalUrl: session.url };
  }

  /**
   * Cancel a subscription at end of billing period.
   */
  static async cancelSubscription(stripeSubscriptionId: string) {
    if (!stripe) throw new Error('Stripe is not configured');

    const subscription = await stripe.subscriptions.update(
      stripeSubscriptionId,
      { cancel_at_period_end: true }
    );
    return subscription;
  }

  /**
   * Send wallet top-up receipt email via Resend.
   */
  static async sendTopUpReceipt(params: {
    userEmail: string;
    userName: string;
    amount: number;
    newBalance: number;
    transactionId: string;
  }) {
    if (!resend) {
      logger.warn('Resend not configured — skipping receipt email');
      return;
    }

    const { userEmail, userName, amount, newBalance, transactionId } = params;

    try {
      await resend.emails.send({
        from: 'Convoia AI <onboarding@resend.dev>',
        to: userEmail,
        subject: `Wallet topped up — $${amount.toFixed(2)}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Inter, -apple-system, sans-serif; background: #f9f9f9; margin: 0; padding: 20px; }
  .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: #7C3AED; padding: 32px; text-align: center; }
  .header h1 { color: white; margin: 0; font-size: 20px; }
  .body { padding: 32px; }
  .amount { font-size: 48px; font-weight: 700; color: #111; text-align: center; margin: 24px 0; }
  .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
  .label { color: #666; }
  .value { font-weight: 500; color: #111; }
  .footer { text-align: center; padding: 20px 32px; background: #f9f9f9; font-size: 12px; color: #999; }
</style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Convoia AI</h1></div>
    <div class="body">
      <p style="color:#666; margin:0 0 8px;">Hi ${userName},</p>
      <p style="color:#111; font-size:16px; margin:0 0 24px;">Your wallet has been topped up successfully.</p>
      <div class="amount">+$${amount.toFixed(2)}</div>
      <div class="row"><span class="label">Amount added</span><span class="value">$${amount.toFixed(2)}</span></div>
      <div class="row"><span class="label">New balance</span><span class="value" style="color:#7C3AED">$${newBalance.toFixed(2)}</span></div>
      <div class="row"><span class="label">Transaction ID</span><span class="value" style="font-size:12px;font-family:monospace">${transactionId}</span></div>
      <div class="row"><span class="label">Date</span><span class="value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
      <div style="margin-top:24px; text-align:center">
        <a href="${config.frontendUrl}/chat" style="background:#7C3AED;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px">Start Chatting</a>
      </div>
    </div>
    <div class="footer">Convoia AI &middot; All rights reserved</div>
  </div>
</body>
</html>`,
      });
      logger.info(`Receipt email sent to ${userEmail}`);
    } catch (err) {
      logger.error('Failed to send receipt email:', err);
    }
  }

  /**
   * Send subscription confirmation email via Resend.
   */
  static async sendSubscriptionEmail(params: {
    userEmail: string;
    userName: string;
    plan: string;
    amount: number;
    nextBillingDate: string;
  }) {
    if (!resend) {
      logger.warn('Resend not configured — skipping subscription email');
      return;
    }

    const { userEmail, userName, plan, amount, nextBillingDate } = params;

    try {
      const tokensLabel =
        plan === 'starter' ? '500K' : plan === 'pro' ? '2M' : '10M';
      const teamLabel =
        plan === 'business'
          ? 'Unlimited team members'
          : plan === 'pro'
            ? 'Team management (10 members)'
            : 'Personal use';

      await resend.emails.send({
        from: 'Convoia AI <onboarding@resend.dev>',
        to: userEmail,
        subject: `Welcome to Convoia ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan!`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Inter, -apple-system, sans-serif; background: #f9f9f9; margin: 0; padding: 20px; }
  .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #7C3AED, #4F46E5); padding: 40px 32px; text-align: center; }
  .plan-badge { display: inline-block; background: rgba(255,255,255,0.2); color: white; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; margin-bottom: 12px; }
  .body { padding: 32px; }
  .feature { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; color: #333; }
  .checkmark { color: #7C3AED; font-weight: 700; }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="plan-badge">${plan.toUpperCase()} PLAN</div>
      <h1 style="color:white;margin:0;font-size:24px">You're all set!</h1>
    </div>
    <div class="body">
      <p style="color:#666">Hi ${userName},</p>
      <p style="color:#111;font-size:16px">Your <strong>${plan}</strong> subscription is now active.</p>
      <div style="background:#f8f7ff;border-radius:10px;padding:20px;margin:20px 0">
        <div class="feature"><span class="checkmark">&#10003;</span><span>${tokensLabel} tokens/month</span></div>
        <div class="feature"><span class="checkmark">&#10003;</span><span>All 16 AI models</span></div>
        <div class="feature"><span class="checkmark">&#10003;</span><span>${teamLabel}</span></div>
      </div>
      <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px">
          <span style="color:#666">Monthly charge</span>
          <span style="font-weight:600">$${amount}/month</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px">
          <span style="color:#666">Next billing date</span>
          <span style="font-weight:600">${nextBillingDate}</span>
        </div>
      </div>
      <div style="text-align:center;margin-top:24px">
        <a href="${config.frontendUrl}/chat" style="background:#7C3AED;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500">Start Using Convoia</a>
      </div>
    </div>
  </div>
</body>
</html>`,
      });
      logger.info(`Subscription email sent to ${userEmail}`);
    } catch (err) {
      logger.error('Failed to send subscription email:', err);
    }
  }
}

export { stripe, PLAN_CONFIG };
export type { PlanKey };
