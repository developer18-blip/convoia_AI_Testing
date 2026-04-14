// Complete billing-cycle trace for a single user.
//
// Usage: node scripts/billing-trace.mjs <email>
//
// Reports every table in the billing pipeline and flags inconsistencies
// between them. Use this to verify that a query -> cost -> deduction ->
// transaction record chain is working correctly.
//
// Tables inspected:
//   1. User + Organization
//   2. Wallet          (USD balance — used by Stripe top-ups)
//   3. TokenWallet     (integer token balance — actual deduction path)
//   4. TokenPool       (org-level shared pool, if any)
//   5. Budget          (dollar spending cap)
//   6. Subscription    (plan + token quota)
//   7. TokenTransaction (last 15 — should show one 'usage' per query)
//   8. WalletTransaction (USD top-ups/deductions)
//   9. TokenPurchase   (Stripe-paid top-ups)
//  10. BillingRecord   (invoices)
//  11. UsageLog        (last 10 — should match TokenTransaction count)
//
// Consistency checks:
//   A. Sum of UsageLog.totalTokens should == TokenWallet.totalTokensUsed
//      (within small rounding — cost-adjusted tokens may differ slightly)
//   B. Sum of UsageLog.customerPrice should == Budget.currentUsage
//   C. Every UsageLog row should have a matching 'usage' TokenTransaction

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/billing-trace.mjs <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  include: {
    organization: true,
    wallet: true,
    tokenWallet: true,
  },
}).catch(async () => {
  // tokenWallet relation name may differ — fall back to raw query
  return await prisma.user.findUnique({
    where: { email },
    include: { organization: true, wallet: true },
  });
});

if (!user) {
  console.error(`No user found for ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

// TokenWallet may not be included via relation — fetch directly
const tokenWallet = await prisma.tokenWallet.findUnique({ where: { userId: user.id } });

// Org-level state (if user has an org)
const tokenPool = user.organizationId
  ? await prisma.tokenPool.findUnique({ where: { organizationId: user.organizationId } })
  : null;

const budgets = await prisma.budget.findMany({
  where: { userId: user.id },
});

const subscriptions = await prisma.subscription.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: 'desc' },
});

const recentTokenTxns = await prisma.tokenTransaction.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: 'desc' },
  take: 15,
});

const walletTxns = user.wallet
  ? await prisma.walletTransaction.findMany({
      where: { walletId: user.wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
  : [];

const purchases = await prisma.tokenPurchase.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: 'desc' },
  take: 5,
});

const bills = await prisma.billingRecord.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: 'desc' },
  take: 5,
});

const recentUsage = await prisma.usageLog.findMany({
  where: { userId: user.id },
  orderBy: { createdAt: 'desc' },
  take: 10,
  include: { model: { select: { name: true, provider: true } } },
});

// Aggregates for consistency checks
const usageAgg = await prisma.usageLog.aggregate({
  where: { userId: user.id },
  _count: { _all: true },
  _sum: { totalTokens: true, customerPrice: true, providerCost: true },
});

const txnUsageAgg = await prisma.tokenTransaction.aggregate({
  where: { userId: user.id, type: 'usage' },
  _count: { _all: true },
  _sum: { tokens: true },
});

// ── formatters ──
const usd = (n) => `$${Number(n).toFixed(6)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const line = '═'.repeat(74);
const dash = '─'.repeat(74);
const check = (ok) => ok ? '✓' : '✗';
const dtStr = (d) => d ? new Date(d).toISOString().replace('T', ' ').substring(0, 19) : '—';

console.log('');
console.log(line);
console.log(`  BILLING TRACE — ${user.email}${user.name ? '  ·  ' + user.name : ''}`);
console.log(line);

// ── 1. Identity ──
console.log('');
console.log('  1. USER + ORG');
console.log(dash);
console.log(`  User ID:        ${user.id}`);
console.log(`  Role:           ${user.role}`);
console.log(`  Status:         ${user.isActive ? 'active' : 'INACTIVE'} · ${user.isVerified ? 'verified' : 'UNVERIFIED'}`);
console.log(`  Joined:         ${dtStr(user.createdAt)}`);
if (user.organization) {
  console.log(`  Org:            ${user.organization.name}  (id: ${user.organization.id})`);
  console.log(`  Tier:           ${user.organization.tier || '—'}`);
  console.log(`  Industry:       ${user.organization.industry || '—'}`);
} else {
  console.log(`  Org:            (none — personal account)`);
}

// ── 2. USD Wallet ──
console.log('');
console.log('  2. WALLET  (USD — Stripe top-up path)');
console.log(dash);
if (!user.wallet) {
  console.log('  ✗ NO WALLET ROW — this means Stripe top-ups will fail');
} else {
  console.log(`  Balance:        ${usd(user.wallet.balance)} ${user.wallet.currency}`);
  console.log(`  Topped up:      ${usd(user.wallet.totalToppedUp)} total`);
  console.log(`  Spent:          ${usd(user.wallet.totalSpent)} total`);
  console.log(`  Last top-up:    ${dtStr(user.wallet.lastTopedUpAt)}`);
}

// ── 3. TokenWallet ──
console.log('');
console.log('  3. TOKEN WALLET  (integer — ACTUAL DEDUCTION PATH used by every query)');
console.log(dash);
if (!tokenWallet) {
  console.log('  ✗ NO TOKEN WALLET — every query to this user will 500 on deduction');
  console.log('    Fix: TokenWalletService should create one on first query, but');
  console.log('    if this row is missing, billing is broken for this user.');
} else {
  console.log(`  Token balance:       ${num(tokenWallet.tokenBalance)} tokens  ← what gets deducted`);
  console.log(`  Total purchased:     ${num(tokenWallet.totalTokensPurchased)} tokens (Stripe or admin grant)`);
  console.log(`  Total used:          ${num(tokenWallet.totalTokensUsed)} tokens`);
  console.log(`  Allocated (org):     ${num(tokenWallet.allocatedTokens)} tokens  ← from org pool`);
  console.log(`  Allocated by:        ${tokenWallet.allocatedBy || '—'}`);
  console.log(`  Last updated:        ${dtStr(tokenWallet.updatedAt)}`);
}

// ── 4. Org Token Pool ──
console.log('');
console.log('  4. ORG TOKEN POOL  (shared pool for the user\'s organization)');
console.log(dash);
if (!user.organizationId) {
  console.log('  (user has no org — not applicable)');
} else if (!tokenPool) {
  console.log('  ✗ Org has no TokenPool row. Employees in this org can\'t be allocated tokens.');
} else {
  console.log(`  Total tokens:        ${num(tokenPool.totalTokens)}   ← pool size`);
  console.log(`  Allocated out:       ${num(tokenPool.allocatedTokens)}   ← given to members`);
  console.log(`  Used:                ${num(tokenPool.usedTokens)}   ← actually consumed`);
  console.log(`  Available:           ${num(tokenPool.availableTokens)}   ← still free to allocate`);
}

// ── 5. Budget ──
console.log('');
console.log('  5. BUDGET  (monthly dollar spending cap with auto-downgrade)');
console.log(dash);
if (budgets.length === 0) {
  console.log('  (no budget set — no spending cap enforced)');
} else {
  for (const b of budgets) {
    console.log(`  Monthly cap:    ${usd(b.monthlyCap)}`);
    console.log(`  Used so far:    ${usd(b.currentUsage)}  (${((b.currentUsage / b.monthlyCap) * 100).toFixed(1)}%)`);
    console.log(`  Alert at:       ${b.alertThreshold}%`);
    console.log(`  Auto-downgrade: ${b.autoDowngrade ? 'yes' : 'no'}`);
    console.log(`  Resets:         ${dtStr(b.resetDate)}`);
  }
}

// ── 6. Subscription ──
console.log('');
console.log('  6. SUBSCRIPTION');
console.log(dash);
if (subscriptions.length === 0) {
  console.log('  (no subscription row — user is on implicit free tier)');
} else {
  for (const s of subscriptions) {
    console.log(`  Plan:           ${s.plan}  ·  ${s.status}`);
    console.log(`  Monthly quota:  ${num(s.monthlyTokenQuota)} tokens`);
    console.log(`  Used this mo:   ${num(s.tokensUsedThisMonth)} tokens  (${((s.tokensUsedThisMonth / s.monthlyTokenQuota) * 100).toFixed(1)}%)`);
    console.log(`  Stripe sub id:  ${s.stripeSubscriptionId || '—'}`);
    console.log(`  Quota resets:   ${dtStr(s.quotaResetDate)}`);
  }
}

// ── 7. TokenTransaction log ──
console.log('');
console.log('  7. TOKEN TRANSACTION HISTORY  (last 15 — one per query + top-ups)');
console.log(dash);
if (recentTokenTxns.length === 0) {
  console.log('  ✗ No TokenTransaction rows. If UsageLog shows queries, billing is NOT wiring up.');
} else {
  for (const t of recentTokenTxns) {
    const sign = t.tokens >= 0 ? '+' : '';
    console.log(`  ${dtStr(t.createdAt)}  ${t.type.padEnd(22)}  ${sign}${t.tokens.toString().padStart(10)}  → bal ${num(t.balanceAfter).padStart(10)}  ${t.description.substring(0, 30)}`);
  }
}

// ── 8. Wallet transactions (USD) ──
if (walletTxns.length > 0) {
  console.log('');
  console.log('  8. WALLET (USD) TRANSACTIONS  (last 10)');
  console.log(dash);
  for (const w of walletTxns) {
    console.log(`  ${dtStr(w.createdAt)}  ${w.type.padEnd(15)}  ${usd(w.amount).padStart(14)}  ${w.description}`);
  }
}

// ── 9. Stripe token purchases ──
if (purchases.length > 0) {
  console.log('');
  console.log('  9. TOKEN PURCHASES  (Stripe top-ups)');
  console.log(dash);
  for (const p of purchases) {
    console.log(`  ${dtStr(p.createdAt)}  ${p.packageName.padEnd(20)}  ${num(p.tokensPurchased)} tokens  $${p.amountPaid.toFixed(2)}`);
  }
}

// ── 10. Billing records ──
if (bills.length > 0) {
  console.log('');
  console.log('  10. BILLING RECORDS  (invoices)');
  console.log(dash);
  for (const b of bills) {
    console.log(`  ${dtStr(b.createdAt)}  ${b.type.padEnd(15)}  ${usd(b.amount).padStart(14)}  ${b.status}  ${b.description}`);
  }
}

// ── 11. Recent usage ──
console.log('');
console.log('  11. RECENT USAGE  (last 10 queries)');
console.log(dash);
if (recentUsage.length === 0) {
  console.log('  (no queries yet)');
} else {
  for (const u of recentUsage) {
    const m = u.model ? `${u.model.name}` : '<deleted>';
    console.log(`  ${dtStr(u.createdAt)}  ${m.padEnd(22)}  ${num(u.totalTokens).padStart(8)}t  ${usd(u.customerPrice).padStart(14)}`);
  }
}

// ── Consistency checks ──
console.log('');
console.log(line);
console.log('  CONSISTENCY CHECKS');
console.log(line);

const usageQueries = usageAgg._count._all || 0;
const usageTokens = usageAgg._sum.totalTokens || 0;
const usageRevenue = Number(usageAgg._sum.customerPrice || 0);
const usageCogs = Number(usageAgg._sum.providerCost || 0);

const txnQueries = txnUsageAgg._count._all || 0;
const txnTokens = Math.abs(txnUsageAgg._sum.tokens || 0);

console.log('');
console.log(`  Check A — UsageLog count matches TokenTransaction('usage') count:`);
console.log(`    UsageLog:          ${usageQueries} rows`);
console.log(`    TokenTransaction:  ${txnQueries} rows`);
console.log(`    ${check(usageQueries === txnQueries)}  ${usageQueries === txnQueries ? 'MATCH — every query produced a deduction record' : 'MISMATCH — some queries bypassed billing'}`);

console.log('');
console.log(`  Check B — UsageLog.totalTokens vs TokenTransaction('usage').tokens:`);
console.log(`    UsageLog sum:      ${num(usageTokens)} tokens`);
console.log(`    TokenTxn sum:      ${num(txnTokens)} tokens (cost-adjusted)`);
const ratio = usageTokens > 0 ? txnTokens / usageTokens : 0;
console.log(`    ratio:             ${ratio.toFixed(2)}× (costAdjustedTokens amplifies raw tokens by model cost)`);
console.log(`    ${check(txnTokens > 0)}  ${txnTokens > 0 ? 'Deductions are happening' : 'No deduction tokens recorded — billing is NOT firing'}`);

if (tokenWallet) {
  console.log('');
  console.log(`  Check C — TokenWallet.totalTokensUsed matches TokenTransaction history:`);
  console.log(`    TokenWallet.totalTokensUsed: ${num(tokenWallet.totalTokensUsed)}`);
  console.log(`    TokenTransaction sum:        ${num(txnTokens)}`);
  const walletMatch = Math.abs(tokenWallet.totalTokensUsed - txnTokens) < 10;
  console.log(`    ${check(walletMatch)}  ${walletMatch ? 'MATCH' : 'DRIFT — wallet counter out of sync with transaction log'}`);
}

if (budgets.length > 0) {
  const b = budgets[0];
  console.log('');
  console.log(`  Check D — Budget.currentUsage matches UsageLog.customerPrice sum:`);
  console.log(`    Budget.currentUsage:  ${usd(b.currentUsage)}`);
  console.log(`    UsageLog sum:         ${usd(usageRevenue)}`);
  const budgetMatch = Math.abs(b.currentUsage - usageRevenue) < 0.01;
  console.log(`    ${check(budgetMatch)}  ${budgetMatch ? 'MATCH' : 'DRIFT — budget tracker out of sync with actual usage'}`);
}

console.log('');
console.log(line);
console.log('');

await prisma.$disconnect();
