import Stripe from 'stripe';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { TOKEN_PACKAGES } from '../config/tokenPackages.js';

const stripe = config.stripeSecretKey
  ? new Stripe(config.stripeSecretKey)
  : null;

export class StripeService {
  static async getOrCreateCustomer(userId: string): Promise<string> {
    if (!stripe) throw new Error('Stripe is not configured');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) throw new Error('User not found');

    const existing = await stripe.customers.list({ email: user.email, limit: 1 });
    if (existing.data.length > 0) return existing.data[0].id;

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user.id, organizationId: user.organizationId ?? '' },
    });

    logger.info(`Stripe customer created: ${customer.id} for user: ${userId}`);
    return customer.id;
  }

  /**
   * Create a Stripe Checkout Session for a token package purchase.
   */
  static async createTokenCheckout(params: {
    userId: string;
    packageId: string;
    organizationId?: string;
  }) {
    if (!stripe) throw new Error('Stripe is not configured');

    const { userId, packageId, organizationId } = params;
    const pkg = TOKEN_PACKAGES.find(p => p.id === packageId);
    if (!pkg) throw new Error(`Invalid package: ${packageId}`);

    const customerId = await this.getOrCreateCustomer(userId);
    const frontendUrl = config.frontendUrl;

    const tokenLabel = pkg.tokens >= 1_000_000
      ? `${(pkg.tokens / 1_000_000).toFixed(0)}M`
      : `${(pkg.tokens / 1_000).toFixed(0)}K`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${pkg.name} — ${tokenLabel} Tokens`,
            description: pkg.description,
          },
          unit_amount: Math.round(pkg.price * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${frontendUrl}/tokens/buy?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/tokens/buy?cancelled=true`,
      metadata: {
        userId,
        organizationId: organizationId || '',
        type: 'token_purchase',
        packageId: pkg.id,
        packageName: pkg.name,
        tokens: String(pkg.tokens),
        amount: String(pkg.price),
      },
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });

    logger.info(`Token checkout created: ${session.id} for ${pkg.name} (${tokenLabel})`);
    return { checkoutUrl: session.url, sessionId: session.id };
  }

}

export { stripe, TOKEN_PACKAGES };
