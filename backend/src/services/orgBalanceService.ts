import prisma from '../config/db.js';

export interface OrgTokenBalance {
  totalTokens: number;
  allocatedTokens: number;
  usedTokens: number;
  availableTokens: number;
}

/**
 * Authoritative current token balance for an organization.
 *
 * The org's tokens live on the OWNER's TokenWallet (Stripe purchases credit the
 * owner; allocations move tokens to members). The legacy TokenPool table is only
 * populated for orgs using the explicit allocation flow, so we prefer a real pool
 * row when present and otherwise derive from the owner's wallet — falling back to
 * the pool blindly showed zeros while the wallet held a real balance.
 *
 * Single source of truth shared by stripeController.getTokenPoolStatus and the
 * daily digest, so the two can't drift.
 */
export async function getOrgTokenBalance(organizationId: string): Promise<OrgTokenBalance> {
  const [pool, org] = await Promise.all([
    prisma.tokenPool.findUnique({ where: { organizationId } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
  ]);

  if (pool && pool.totalTokens > 0) {
    return {
      totalTokens: pool.totalTokens,
      allocatedTokens: pool.allocatedTokens,
      usedTokens: pool.usedTokens,
      availableTokens: pool.availableTokens,
    };
  }

  const ownerWallet = org
    ? await prisma.tokenWallet.findUnique({ where: { userId: org.ownerId } })
    : null;

  return {
    totalTokens: ownerWallet?.totalTokensPurchased ?? 0,
    allocatedTokens: ownerWallet?.allocatedTokens ?? 0,
    usedTokens: ownerWallet?.totalTokensUsed ?? 0,
    availableTokens: ownerWallet?.tokenBalance ?? 0,
  };
}
