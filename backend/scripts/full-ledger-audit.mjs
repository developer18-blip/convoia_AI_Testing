// Full ledger audit — every place on the platform that tracks money.
//
// Goal: explain the $26.22 discrepancy by checking every table that
// could hold cost/revenue data, not just UsageLog.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const line = '═'.repeat(78);
const dash = '─'.repeat(78);
const usd = (n) => `$${Number(n).toFixed(6)}`;
const usd4 = (n) => `$${Number(n).toFixed(4)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const dtStr = (d) => d ? new Date(d).toISOString().replace('T', ' ').substring(0, 19) : '—';

console.log('');
console.log(line);
console.log('  FULL LEDGER AUDIT  —  every cost/revenue table on the platform');
console.log(`  Generated: ${new Date().toISOString()}`);
console.log(line);

// ── 1. UsageLog (all rows, by status) ────────────────────────
console.log('');
console.log('  1. UsageLog  (all rows regardless of status)');
console.log(dash);
const usageAll = await prisma.usageLog.aggregate({
  _count: { _all: true },
  _sum: { providerCost: true, customerPrice: true, totalTokens: true },
});
console.log(`  Total rows:        ${usageAll._count._all}`);
console.log(`  Total tokens:      ${num(usageAll._sum.totalTokens || 0)}`);
console.log(`  Provider COGS:     ${usd(usageAll._sum.providerCost || 0)}`);
console.log(`  Customer price:    ${usd(usageAll._sum.customerPrice || 0)}`);

const usageByStatus = await prisma.usageLog.groupBy({
  by: ['status'],
  _count: { _all: true },
  _sum: { providerCost: true, customerPrice: true },
});
console.log('');
console.log('  by status:');
for (const s of usageByStatus) {
  console.log(`    ${(s.status || '<null>').padEnd(12)} ${String(s._count._all).padStart(5)} rows  ·  COGS ${usd4(s._sum.providerCost || 0)}  ·  rev ${usd4(s._sum.customerPrice || 0)}`);
}

// Check for rows with zero provider cost (image gen, etc.)
const zeroCostRows = await prisma.usageLog.aggregate({
  where: { providerCost: 0 },
  _count: { _all: true },
  _sum: { customerPrice: true },
});
console.log('');
console.log(`  rows with providerCost = 0 (image gen / errors):`);
console.log(`    ${zeroCostRows._count._all} rows  ·  customer price ${usd4(zeroCostRows._sum.customerPrice || 0)}`);

// First and last UsageLog
const firstLog = await prisma.usageLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true, prompt: true } });
const lastLog = await prisma.usageLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
console.log('');
console.log(`  Window: ${dtStr(firstLog?.createdAt)}  →  ${dtStr(lastLog?.createdAt)}`);

// ── 2. Wallet (USD — Stripe path) ────────────────────────────
console.log('');
console.log('  2. Wallet  (USD balances — Stripe top-up path)');
console.log(dash);
const walletAgg = await prisma.wallet.aggregate({
  _count: { _all: true },
  _sum: { balance: true, totalToppedUp: true, totalSpent: true },
});
console.log(`  Wallet rows:       ${walletAgg._count._all}`);
console.log(`  Sum of balances:   ${usd(walletAgg._sum.balance || 0)}`);
console.log(`  Total topped up:   ${usd(walletAgg._sum.totalToppedUp || 0)}`);
console.log(`  Total spent:       ${usd(walletAgg._sum.totalSpent || 0)}   ← if this is $26.22, that's the number`);

// ── 3. WalletTransaction ─────────────────────────────────────
console.log('');
console.log('  3. WalletTransaction  (USD debit/credit log)');
console.log(dash);
const walletTxnAgg = await prisma.walletTransaction.aggregate({
  _count: { _all: true },
  _sum: { amount: true },
});
console.log(`  Total rows:        ${walletTxnAgg._count._all}`);
console.log(`  Sum of amounts:    ${usd(walletTxnAgg._sum.amount || 0)}`);

const walletTxnByType = await prisma.walletTransaction.groupBy({
  by: ['type'],
  _count: { _all: true },
  _sum: { amount: true },
});
console.log('');
for (const t of walletTxnByType) {
  console.log(`    ${(t.type || '<null>').padEnd(16)} ${String(t._count._all).padStart(5)} rows  ·  sum ${usd4(t._sum.amount || 0)}`);
}

// ── 4. TokenWallet ────────────────────────────────────────────
console.log('');
console.log('  4. TokenWallet  (integer token balance — real deduction path)');
console.log(dash);
const tokenWalletAgg = await prisma.tokenWallet.aggregate({
  _count: { _all: true },
  _sum: { tokenBalance: true, totalTokensPurchased: true, totalTokensUsed: true, allocatedTokens: true },
});
console.log(`  Wallets:           ${tokenWalletAgg._count._all}`);
console.log(`  Sum of balances:   ${num(tokenWalletAgg._sum.tokenBalance || 0)} tokens`);
console.log(`  Total purchased:   ${num(tokenWalletAgg._sum.totalTokensPurchased || 0)} tokens`);
console.log(`  Total used:        ${num(tokenWalletAgg._sum.totalTokensUsed || 0)} tokens`);
console.log(`  Total allocated:   ${num(tokenWalletAgg._sum.allocatedTokens || 0)} tokens`);

// ── 5. TokenTransaction (by type) ────────────────────────────
console.log('');
console.log('  5. TokenTransaction  (integer token debit/credit log)');
console.log(dash);
const tokenTxnByType = await prisma.tokenTransaction.groupBy({
  by: ['type'],
  _count: { _all: true },
  _sum: { tokens: true },
});
for (const t of tokenTxnByType) {
  const tokens = Number(t._sum.tokens || 0);
  console.log(`    ${(t.type || '<null>').padEnd(20)} ${String(t._count._all).padStart(5)} rows  ·  sum ${num(tokens)} tokens`);
}

// ── 6. BillingRecord ──────────────────────────────────────────
console.log('');
console.log('  6. BillingRecord  (invoices)');
console.log(dash);
const billingAgg = await prisma.billingRecord.aggregate({
  _count: { _all: true },
  _sum: { amount: true },
});
console.log(`  Rows:              ${billingAgg._count._all}`);
console.log(`  Sum of amounts:    ${usd(billingAgg._sum.amount || 0)}`);

if (billingAgg._count._all > 0) {
  const billingByType = await prisma.billingRecord.groupBy({
    by: ['type', 'status'],
    _count: { _all: true },
    _sum: { amount: true },
  });
  for (const b of billingByType) {
    console.log(`    ${(b.type || '<null>').padEnd(18)} ${(b.status || '').padEnd(12)} ${String(b._count._all).padStart(4)} rows  ·  sum ${usd4(b._sum.amount || 0)}`);
  }
}

// ── 7. TokenPurchase (Stripe top-ups) ────────────────────────
console.log('');
console.log('  7. TokenPurchase  (Stripe token top-ups)');
console.log(dash);
const purchaseAgg = await prisma.tokenPurchase.aggregate({
  _count: { _all: true },
  _sum: { tokensPurchased: true, amountPaid: true },
});
console.log(`  Rows:              ${purchaseAgg._count._all}`);
console.log(`  Tokens purchased:  ${num(purchaseAgg._sum.tokensPurchased || 0)}`);
console.log(`  Amount paid:       ${usd(purchaseAgg._sum.amountPaid || 0)}`);

// ── 8. Budget.currentUsage sum ───────────────────────────────
console.log('');
console.log('  8. Budget  (per-user spending trackers)');
console.log(dash);
const budgetAgg = await prisma.budget.aggregate({
  _count: { _all: true },
  _sum: { monthlyCap: true, currentUsage: true },
});
console.log(`  Rows:              ${budgetAgg._count._all}`);
console.log(`  Sum monthly caps:  ${usd(budgetAgg._sum.monthlyCap || 0)}`);
console.log(`  Sum currentUsage:  ${usd(budgetAgg._sum.currentUsage || 0)}   ← this could be the $26.22`);

// ── 9. Subscription token-used sum ───────────────────────────
console.log('');
console.log('  9. Subscription  (tokensUsedThisMonth sum)');
console.log(dash);
const subAgg = await prisma.subscription.aggregate({
  _count: { _all: true },
  _sum: { monthlyTokenQuota: true, tokensUsedThisMonth: true },
});
console.log(`  Rows:              ${subAgg._count._all}`);
console.log(`  Sum quota:         ${num(subAgg._sum.monthlyTokenQuota || 0)}`);
console.log(`  Sum used this mo:  ${num(subAgg._sum.tokensUsedThisMonth || 0)}`);

// ── 10. Organization-level totalSpent ────────────────────────
console.log('');
console.log('  10. Organization.totalSpent  (if field exists)');
console.log(dash);
try {
  const orgAgg = await prisma.organization.findMany({
    select: { id: true, name: true, totalSpent: true },
    orderBy: { totalSpent: 'desc' },
  });
  const sum = orgAgg.reduce((a, o) => a + Number(o.totalSpent || 0), 0);
  console.log(`  Orgs:              ${orgAgg.length}`);
  console.log(`  Sum totalSpent:    ${usd(sum)}`);
  for (const o of orgAgg.slice(0, 5)) {
    console.log(`    ${o.name.padEnd(30)} ${usd4(o.totalSpent || 0)}`);
  }
} catch (e) {
  console.log('  (no totalSpent field on Organization)');
}

// ── 11. Summary / reconciliation ─────────────────────────────
console.log('');
console.log(line);
console.log('  CANDIDATES FOR THE $26.22 NUMBER');
console.log(line);
console.log(`  UsageLog.customerPrice sum:       ${usd4(usageAll._sum.customerPrice || 0)}`);
console.log(`  Wallet.totalSpent sum:            ${usd4(walletAgg._sum.totalSpent || 0)}`);
console.log(`  Budget.currentUsage sum:          ${usd4(budgetAgg._sum.currentUsage || 0)}`);
console.log(`  BillingRecord.amount sum:         ${usd4(billingAgg._sum.amount || 0)}`);
console.log(`  TokenPurchase.amountPaid sum:     ${usd4(purchaseAgg._sum.amountPaid || 0)}`);
console.log('');
console.log('  Whichever number above equals $26.22 tells you which ledger');
console.log('  the dashboard is reading from.');
console.log('');

await prisma.$disconnect();
