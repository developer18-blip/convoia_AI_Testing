// Perplexity usage report across the entire platform.
//
// Reports all usage of Perplexity (sonar-*) models — who used them,
// how much they cost us upstream, how much we billed, and the profit.
//
// Usage: node scripts/perplexity-usage.mjs

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── Find all Perplexity models ─────────────────────────────
const pplxModels = await prisma.aIModel.findMany({
  where: { provider: 'perplexity' },
  select: {
    id: true, name: true, modelId: true,
    inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
    isActive: true,
  },
});

if (pplxModels.length === 0) {
  console.log('No Perplexity models found in AIModel table.');
  await prisma.$disconnect();
  process.exit(0);
}

const pplxModelIds = pplxModels.map((m) => m.id);
const modelById = new Map(pplxModels.map((m) => [m.id, m]));

// ── Platform totals for Perplexity ─────────────────────────
const total = await prisma.usageLog.aggregate({
  where: { modelId: { in: pplxModelIds } },
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

// ── Per model breakdown ────────────────────────────────────
const perModel = await prisma.usageLog.groupBy({
  by: ['modelId'],
  where: { modelId: { in: pplxModelIds } },
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

// ── Per user breakdown ─────────────────────────────────────
const perUser = await prisma.usageLog.groupBy({
  by: ['userId'],
  where: { modelId: { in: pplxModelIds } },
  _count: { _all: true },
  _sum: {
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
  orderBy: { _sum: { customerPrice: 'desc' } },
});

const userIds = perUser.map((u) => u.userId);
const users = userIds.length
  ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, email: true, name: true,
        organization: { select: { name: true, tier: true, industry: true } },
      },
    })
  : [];
const userById = new Map(users.map((u) => [u.id, u]));

// ── Per organization breakdown ─────────────────────────────
const orgAggMap = new Map();
for (const u of perUser) {
  const user = userById.get(u.userId);
  const orgName = user?.organization?.name || '(individual)';
  const orgTier = user?.organization?.tier || '';
  const key = `${orgName}|${orgTier}`;
  if (!orgAggMap.has(key)) {
    orgAggMap.set(key, {
      name: orgName,
      tier: orgTier,
      industry: user?.organization?.industry || '',
      users: 0,
      queries: 0,
      tokens: 0,
      providerCost: 0,
      customerPrice: 0,
    });
  }
  const o = orgAggMap.get(key);
  o.users += 1;
  o.queries += u._count._all || 0;
  o.tokens += u._sum.totalTokens || 0;
  o.providerCost += Number(u._sum.providerCost || 0);
  o.customerPrice += Number(u._sum.customerPrice || 0);
}

// ── First / last usage dates ───────────────────────────────
const firstUsage = await prisma.usageLog.findFirst({
  where: { modelId: { in: pplxModelIds } },
  orderBy: { createdAt: 'asc' },
  select: { createdAt: true },
});
const lastUsage = await prisma.usageLog.findFirst({
  where: { modelId: { in: pplxModelIds } },
  orderBy: { createdAt: 'desc' },
  select: { createdAt: true },
});

// ── Platform-wide totals (for share %) ─────────────────────
const platformTotal = await prisma.usageLog.aggregate({
  _count: { _all: true },
  _sum: {
    providerCost: true,
    customerPrice: true,
  },
});

const platformQueries = platformTotal._count._all || 0;
const platformCOGS = Number(platformTotal._sum.providerCost || 0);
const platformRev = Number(platformTotal._sum.customerPrice || 0);

const totQueries = total._count._all || 0;
const totInput = total._sum.tokensInput || 0;
const totOutput = total._sum.tokensOutput || 0;
const totTokens = total._sum.totalTokens || 0;
const totCOGS = Number(total._sum.providerCost || 0);
const totRev = Number(total._sum.customerPrice || 0);
const totProfit = totRev - totCOGS;
const totMargin = totRev > 0 ? (totProfit / totRev) * 100 : 0;

// ── Formatters ─────────────────────────────────────────────
const usd = (n) => `$${Number(n).toFixed(6)}`;
const usd4 = (n) => `$${Number(n).toFixed(4)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (n) => `${Number(n).toFixed(2)}%`;
const dtStr = (d) => d ? new Date(d).toISOString().split('T')[0] : '—';
const line = '═'.repeat(78);
const dash = '─'.repeat(78);
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

// ── Output ─────────────────────────────────────────────────
console.log('');
console.log(line);
console.log('  PERPLEXITY USAGE REPORT  (entire platform, all time)');
console.log(`  Generated: ${new Date().toISOString()}`);
console.log(line);
console.log('');

console.log('  REGISTERED PERPLEXITY MODELS');
console.log(dash);
for (const m of pplxModels) {
  const status = m.isActive ? 'active' : 'DISABLED';
  console.log(`  ${pad(m.name, 28)} (${m.modelId})  [${status}]`);
  console.log(
    `    DB pricing: $${Number(m.inputTokenPrice) * 1e6}/1M in · $${Number(m.outputTokenPrice) * 1e6}/1M out · markup ${m.markupPercentage}%`
  );
}
console.log('');

console.log('  PLATFORM TOTALS  (Perplexity only)');
console.log(dash);
if (firstUsage && lastUsage) {
  console.log(`  Activity window:   ${dtStr(firstUsage.createdAt)}  →  ${dtStr(lastUsage.createdAt)}`);
}
console.log(`  Queries:           ${num(totQueries)}`);
console.log(`  Input tokens:      ${num(totInput)}`);
console.log(`  Output tokens:     ${num(totOutput)}`);
console.log(`  Total tokens:      ${num(totTokens)}`);
console.log(`  Provider COGS:     ${usd(totCOGS)}   ← what ConvoiaAI paid Perplexity`);
console.log(`  Customer revenue:  ${usd(totRev)}   ← what users were billed`);
console.log(`  Profit:            ${usd(totProfit)}`);
console.log(`  Margin:            ${pct(totMargin)}`);
console.log('');

console.log('  SHARE OF PLATFORM  (Perplexity vs all providers)');
console.log(dash);
const queryShare = platformQueries > 0 ? (totQueries / platformQueries) * 100 : 0;
const cogsShare = platformCOGS > 0 ? (totCOGS / platformCOGS) * 100 : 0;
const revShare = platformRev > 0 ? (totRev / platformRev) * 100 : 0;
console.log(`  Query share:       ${num(totQueries)} / ${num(platformQueries)}  (${pct(queryShare)})`);
console.log(`  COGS share:        ${usd4(totCOGS)} / ${usd4(platformCOGS)}  (${pct(cogsShare)})`);
console.log(`  Revenue share:     ${usd4(totRev)} / ${usd4(platformRev)}  (${pct(revShare)})`);
console.log('');

if (perModel.length === 0) {
  console.log('  No Perplexity usage found yet.');
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('  BY MODEL  (sorted by revenue)');
console.log(dash);
console.log(
  '  ' +
    pad('model', 26) +
    rpad('queries', 9) +
    rpad('tokens', 14) +
    rpad('COGS', 13) +
    rpad('revenue', 13) +
    rpad('margin', 9)
);
console.log(dash);
const sortedModels = perModel
  .map((p) => ({ ...p, model: modelById.get(p.modelId) }))
  .sort((a, b) => Number(b._sum.customerPrice || 0) - Number(a._sum.customerPrice || 0));

for (const row of sortedModels) {
  const name = row.model?.name || `<deleted ${row.modelId}>`;
  const q = row._count._all || 0;
  const t = row._sum.totalTokens || 0;
  const pc = Number(row._sum.providerCost || 0);
  const cp = Number(row._sum.customerPrice || 0);
  const margin = cp > 0 ? ((cp - pc) / cp) * 100 : 0;
  console.log(
    '  ' +
      pad(name.substring(0, 25), 26) +
      rpad(num(q), 9) +
      rpad(num(t), 14) +
      rpad(usd4(pc), 13) +
      rpad(usd4(cp), 13) +
      rpad(pct(margin), 9)
  );
}
console.log('');

console.log(`  BY ORGANIZATION  (${orgAggMap.size} distinct)`);
console.log(dash);
const sortedOrgs = [...orgAggMap.values()].sort((a, b) => b.customerPrice - a.customerPrice);
for (const o of sortedOrgs) {
  const tierLabel = o.tier ? ` [${o.tier}]` : '';
  const industryLabel = o.industry ? ` · ${o.industry}` : '';
  console.log(`  ${o.name}${tierLabel}${industryLabel}`);
  const margin = o.customerPrice > 0 ? ((o.customerPrice - o.providerCost) / o.customerPrice) * 100 : 0;
  console.log(
    `    ${o.users} user(s)  ·  ${num(o.queries)} queries  ·  ${num(o.tokens)} tokens  ·  COGS ${usd4(o.providerCost)}  ·  rev ${usd4(o.customerPrice)}  ·  margin ${pct(margin)}`
  );
}
console.log('');

console.log(`  BY USER  (${perUser.length} distinct, sorted by revenue)`);
console.log(dash);
for (let i = 0; i < perUser.length; i++) {
  const row = perUser[i];
  const u = userById.get(row.userId);
  const who = u ? `${u.email}${u.name ? ` (${u.name})` : ''}` : `<deleted user ${row.userId}>`;
  const org = u?.organization ? ` · ${u.organization.name}` : '';
  const q = row._count._all || 0;
  const t = row._sum.totalTokens || 0;
  const pc = Number(row._sum.providerCost || 0);
  const cp = Number(row._sum.customerPrice || 0);
  const margin = cp > 0 ? ((cp - pc) / cp) * 100 : 0;
  console.log(`  ${i + 1}. ${who}${org}`);
  console.log(
    `     ${num(q)} queries  ·  ${num(t)} tokens  ·  COGS ${usd4(pc)}  ·  rev ${usd4(cp)}  ·  margin ${pct(margin)}`
  );
}
console.log('');
console.log(line);
console.log('');

await prisma.$disconnect();
