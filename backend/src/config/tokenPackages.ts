export const TOKEN_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    tokens: 500_000,
    price: 5.00,
    pricePerMillion: 10.00,
    description: 'Up to 500 messages',
    savings: null as string | null,
    popular: false,
    color: '#6B7280',
    icon: '⚡',
  },
  {
    id: 'standard',
    name: 'Standard',
    tokens: 2_000_000,
    price: 14.00,
    pricePerMillion: 7.00,
    description: 'Up to 2,000 messages',
    savings: 'Save 30%' as string | null,
    popular: false,
    color: '#3B82F6',
    icon: '🚀',
  },
  {
    id: 'popular',
    name: 'Popular',
    tokens: 5_000_000,
    price: 25.00,
    pricePerMillion: 5.00,
    description: 'Up to 5,000 messages',
    savings: 'Save 50%' as string | null,
    popular: true,
    color: '#7C3AED',
    icon: '⭐',
  },
  {
    id: 'power',
    name: 'Power',
    tokens: 15_000_000,
    price: 60.00,
    pricePerMillion: 4.00,
    description: 'Up to 15,000 messages',
    savings: 'Save 60%' as string | null,
    popular: false,
    color: '#6D28D9',
    icon: '💎',
  },
  {
    id: 'pro',
    name: 'Pro',
    tokens: 50_000_000,
    price: 175.00,
    pricePerMillion: 3.50,
    description: 'Up to 50,000 messages',
    savings: 'Save 65%' as string | null,
    popular: false,
    color: '#4F46E5',
    icon: '🔥',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tokens: 100_000_000,
    price: 300.00,
    pricePerMillion: 3.00,
    description: 'Up to 100,000 messages',
    savings: 'Save 70%' as string | null,
    popular: false,
    color: '#1D4ED8',
    icon: '🏢',
  },
] as const;

// ── DYNAMIC TOKEN BASE RATE ──────────────────────────────────────
// The dollar value of 1 wallet token, derived from the cheapest package.
// This ensures every query is profitable even for bulk buyers.
//
// How it works:
//   1. Find the lowest $/token across all packages (Enterprise = $3/1M = $0.000003)
//   2. Apply 17% platform margin → TOKEN_BASE_RATE ≈ $0.0000025
//   3. costAdjustedTokens() divides the query's $ cost by this rate → wallet tokens to deduct
//   4. Bulk buyers (Enterprise) generate ~17% margin; small buyers (Starter) generate ~70%+
//
// If you change package prices, TOKEN_BASE_RATE auto-adjusts. No manual sync needed.
const PLATFORM_MARGIN = 0.17;
const lowestRatePerToken = Math.min(...TOKEN_PACKAGES.map(p => p.price / p.tokens));
export const TOKEN_BASE_RATE = lowestRatePerToken * (1 - PLATFORM_MARGIN);

/**
 * Convert a query's dollar cost into wallet tokens to deduct.
 * Expensive models deduct MORE tokens; cheap models deduct FEWER.
 * Falls back to raw tokens if cost calculation fails (safety net).
 */
export function costAdjustedTokens(customerPrice: number, rawTokens: number): number {
  if (!customerPrice || customerPrice <= 0 || !TOKEN_BASE_RATE) return rawTokens;
  return Math.max(Math.ceil(customerPrice / TOKEN_BASE_RATE), 1);
}

export type TokenPackage = (typeof TOKEN_PACKAGES)[number];
