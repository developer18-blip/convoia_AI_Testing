// User cost breakdown report.
// Usage:  node scripts/user-usage.mjs <email>
//
// Reports total queries/tokens, raw provider cost (what ConvoiaAI paid
// upstream), customer price (what the user was billed), profit, margin,
// and a per-model breakdown sorted by revenue.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/user-usage.mjs <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true, email: true, name: true, role: true,
    isActive: true, isVerified: true, createdAt: true,
    organizationId: true,
    organization: { select: { name: true, tier: true } },
    wallet: { select: { balance: true, totalToppedUp: true, totalSpent: true, currency: true } },
  },
});

if (!user) {
  console.error(`No user found for email: ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

const agg = await prisma.usageLog.aggregate({
  where: { userId: user.id },
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

const perModel = await prisma.usageLog.groupBy({
  by: ['modelId'],
  where: { userId: user.id },
  _count: { _all: true },
  _sum: {
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

const modelIds = perModel.map((p) => p.modelId);
const models = await prisma.aIModel.findMany({
  where: { id: { in: modelIds } },
  select: { id: true, name: true, provider: true },
});
const modelById = new Map(models.map((m) => [m.id, m]));

const first = await prisma.usageLog.findFirst({
  where: { userId: user.id },
  orderBy: { createdAt: 'asc' },
  select: { createdAt: true },
});
const last = await prisma.usageLog.findFirst({
  where: { userId: user.id },
  orderBy: { createdAt: 'desc' },
  select: { createdAt: true },
});

const queries = agg._count._all || 0;
const inputTokens = agg._sum.tokensInput || 0;
const outputTokens = agg._sum.tokensOutput || 0;
const totalTokens = agg._sum.totalTokens || 0;
const providerCost = Number(agg._sum.providerCost || 0);
const customerPrice = Number(agg._sum.customerPrice || 0);
const profit = customerPrice - providerCost;
const marginPct = customerPrice > 0 ? (profit / customerPrice) * 100 : 0;

const usd = (n) => `$${n.toFixed(6)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (n) => `${n.toFixed(2)}%`;

const line = '═'.repeat(70);
const dash = '─'.repeat(70);

console.log('');
console.log(line);
console.log(`  ACCOUNT: ${user.email}${user.name ? `  ·  ${user.name}` : ''}`);
console.log(line);
console.log(`  Role:         ${user.role}`);
console.log(`  Status:       ${user.isActive ? 'active' : 'INACTIVE'}${user.isVerified ? '' : '  (email UNVERIFIED)'}`);
console.log(`  Joined:       ${user.createdAt.toISOString().split('T')[0]}`);
if (user.organization) {
  console.log(`  Organization: ${user.organization.name} (${user.organization.tier})`);
}
if (user.wallet) {
  console.log(`  Wallet:       ${num(user.wallet.balance)} ${user.wallet.currency}  (topped up: ${num(user.wallet.totalToppedUp)}, spent: ${num(user.wallet.totalSpent)})`);
}
console.log('');
console.log('  USAGE TOTALS');
console.log(dash);
if (first && last) {
  console.log(`  Activity window:  ${first.createdAt.toISOString().split('T')[0]}  →  ${last.createdAt.toISOString().split('T')[0]}`);
}
console.log(`  Queries:          ${num(queries)}`);
console.log(`  Total tokens:     ${num(totalTokens)}   (in: ${num(inputTokens)}, out: ${num(outputTokens)})`);
console.log('');
console.log('  COSTS  (raw upstream AI-provider charges vs what the user paid)');
console.log(dash);
console.log(`  Provider cost:    ${usd(providerCost)}   ← ConvoiaAI COGS (paid to Anthropic/OpenAI/etc.)`);
console.log(`  Customer paid:    ${usd(customerPrice)}   ← ConvoiaAI revenue from this account`);
console.log(`  Profit:           ${usd(profit)}`);
console.log(`  Margin:           ${pct(marginPct)}`);
console.log('');

if (perModel.length === 0) {
  console.log('  No usage logs found for this user.');
} else {
  console.log('  BY MODEL  (sorted by revenue)');
  console.log(dash);
  const sorted = perModel
    .map((p) => ({
      ...p,
      model: modelById.get(p.modelId),
    }))
    .sort((a, b) => Number(b._sum.customerPrice || 0) - Number(a._sum.customerPrice || 0));

  for (const row of sorted) {
    const name = row.model ? `${row.model.name} (${row.model.provider})` : `<deleted model ${row.modelId}>`;
    const q = row._count._all;
    const t = row._sum.totalTokens || 0;
    const pc = Number(row._sum.providerCost || 0);
    const cp = Number(row._sum.customerPrice || 0);
    const pft = cp - pc;
    console.log(`  ${name}`);
    console.log(`    ${q} queries  ·  ${num(t)} tokens  ·  cost ${usd(pc)}  ·  paid ${usd(cp)}  ·  profit ${usd(pft)}`);
  }
}

console.log('');
console.log(line);
console.log('');

await prisma.$disconnect();
