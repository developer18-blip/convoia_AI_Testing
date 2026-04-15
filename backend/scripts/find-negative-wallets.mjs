// Find all TokenWallets with negative balances and trace how they got there.
// Read-only. Does not mutate anything.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const line = '═'.repeat(78);
const dash = '─'.repeat(78);
const num = (n) => Number(n).toLocaleString('en-US');
const dtStr = (d) => d ? new Date(d).toISOString().replace('T', ' ').substring(0, 19) : '—';

// ── 1. Find every wallet with negative balance ──────────────────
const negative = await prisma.tokenWallet.findMany({
  where: { tokenBalance: { lt: 0 } },
  orderBy: { tokenBalance: 'asc' },
});

console.log('');
console.log(line);
console.log('  NEGATIVE TOKEN WALLETS  (tokenBalance < 0)');
console.log(line);
console.log(`  Found ${negative.length} wallet(s) with negative balance.`);
console.log('');

if (negative.length === 0) {
  console.log('  No negative wallets. Platform is clean.');
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}

// ── 2. For each, fetch user + last 5 transactions ────────────────
for (const w of negative) {
  const u = await prisma.user.findUnique({
    where: { id: w.userId },
    select: {
      email: true, name: true, role: true,
      organization: { select: { name: true, tier: true } },
    },
  });

  const txns = await prisma.tokenTransaction.findMany({
    where: { userId: w.userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const txnAgg = await prisma.tokenTransaction.groupBy({
    by: ['type'],
    where: { userId: w.userId },
    _count: { _all: true },
    _sum: { tokens: true },
  });

  console.log(dash);
  if (u) {
    console.log(`  ${u.email}${u.name ? ` (${u.name})` : ''}  · role=${u.role}`);
    if (u.organization) console.log(`  Org: ${u.organization.name} [${u.organization.tier}]`);
  } else {
    console.log(`  <user ${w.userId} not found>`);
  }
  console.log(`  Wallet created: ${dtStr(w.createdAt)}  ·  updated: ${dtStr(w.updatedAt)}`);
  console.log('');
  console.log(`  Balance:        ${num(w.tokenBalance)}   ← NEGATIVE`);
  console.log(`  Total purchased:${num(w.totalTokensPurchased)}`);
  console.log(`  Total used:     ${num(w.totalTokensUsed)}`);
  console.log(`  Allocated:      ${num(w.allocatedTokens)}`);
  console.log('');

  // Reconciliation check
  // Expected balance: totalTokensPurchased + allocatedTokens - totalTokensUsed
  const expected = w.totalTokensPurchased + w.allocatedTokens - w.totalTokensUsed;
  const drift = w.tokenBalance - expected;
  console.log(`  Expected balance (purchased + allocated − used): ${num(expected)}`);
  console.log(`  Drift from expected:                             ${num(drift)}`);
  console.log('');

  console.log('  Transaction summary (by type):');
  for (const t of txnAgg) {
    console.log(`    ${(t.type || '<null>').padEnd(22)} ${String(t._count._all).padStart(5)} rows  ·  sum ${num(t._sum.tokens || 0)} tokens`);
  }
  console.log('');

  console.log('  Last 10 transactions:');
  for (const t of txns) {
    const sign = t.tokens >= 0 ? '+' : '';
    console.log(`    ${dtStr(t.createdAt)}  ${(t.type || '').padEnd(22)} ${sign}${String(t.tokens).padStart(10)}  → bal ${String(t.balanceAfter).padStart(10)}  ${(t.description || '').substring(0, 40)}`);
  }
  console.log('');
}

console.log(line);
console.log('');
console.log('  INTERPRETATION:');
console.log('  • If "Drift from expected" is 0 → the totals agree with the balance,');
console.log('    meaning totalTokensUsed exceeds purchased+allocated by design.');
console.log('    Root cause: at some point the wallet was debited faster than topped up.');
console.log('');
console.log('  • If drift ≠ 0 → the balance column was written separately from the');
console.log('    transaction history. Likely a migration or direct SQL edit.');
console.log('');
console.log('  • Look at the last transaction timestamp: if it is old (pre-guard),');
console.log('    the bug is already fixed and only the historical data is dirty.');
console.log('    If recent, the guard is being bypassed somehow.');
console.log('');

await prisma.$disconnect();
