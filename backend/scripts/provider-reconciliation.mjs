// Provider reconciliation report.
//
// Cross-references platform-recorded COGS against the upstream AI
// providers so you can reconcile with their actual invoices.
//
// Usage:
//   node scripts/provider-reconciliation.mjs
//   node scripts/provider-reconciliation.mjs --month 2026-04
//   node scripts/provider-reconciliation.mjs --from 2026-04-01 --to 2026-04-14
//   node scripts/provider-reconciliation.mjs --month 2026-04 --models
//   node scripts/provider-reconciliation.mjs --top 10
//
// Flags:
//   --month YYYY-MM        Restrict to one calendar month (UTC)
//   --from YYYY-MM-DD      Custom range start (UTC, inclusive)
//   --to   YYYY-MM-DD      Custom range end (UTC, exclusive)
//   --models               Show per-model breakdown inside each provider
//   --top N                Show top N users by spend (default: off)
//
// IMPORTANT: The "Provider cost" values below are CALCULATED from the
// pricing rows in the AIModel table (inputTokenPrice × input_tokens +
// outputTokenPrice × output_tokens). They are only accurate if the
// stored prices match what each provider actually charges. Compare
// against the real invoice you get from Anthropic / OpenAI / Google /
// Perplexity / etc. Discrepancies >5% usually mean DB pricing drift.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
let fromDate = null;
let toDate = null;
let monthArg = null;
let showModels = false;
let topN = 0;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--month' && args[i + 1]) { monthArg = args[++i]; }
  else if (a === '--from' && args[i + 1]) { fromDate = new Date(args[++i] + 'T00:00:00Z'); }
  else if (a === '--to' && args[i + 1]) { toDate = new Date(args[++i] + 'T00:00:00Z'); }
  else if (a === '--models') { showModels = true; }
  else if (a === '--top' && args[i + 1]) { topN = parseInt(args[++i], 10) || 0; }
}

if (monthArg) {
  const m = monthArg.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    console.error('Invalid --month format. Use YYYY-MM (e.g. --month 2026-04)');
    process.exit(1);
  }
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  fromDate = new Date(Date.UTC(year, month - 1, 1));
  toDate = new Date(Date.UTC(year, month, 1));
}

const dateFilter = {};
if (fromDate) dateFilter.gte = fromDate;
if (toDate) dateFilter.lt = toDate;
const where = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

const periodLabel = (() => {
  if (monthArg) return `month ${monthArg}`;
  if (fromDate && toDate) return `${fromDate.toISOString().split('T')[0]} → ${toDate.toISOString().split('T')[0]}`;
  if (fromDate) return `since ${fromDate.toISOString().split('T')[0]}`;
  if (toDate) return `until ${toDate.toISOString().split('T')[0]}`;
  return 'all time';
})();

// ── Platform totals ───────────────────────────────────────────
const total = await prisma.usageLog.aggregate({
  where,
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

const totQueries = total._count._all || 0;
const totInput = total._sum.tokensInput || 0;
const totOutput = total._sum.tokensOutput || 0;
const totTokens = total._sum.totalTokens || 0;
const totCOGS = Number(total._sum.providerCost || 0);
const totRev = Number(total._sum.customerPrice || 0);
const totProfit = totRev - totCOGS;
const totMargin = totRev > 0 ? (totProfit / totRev) * 100 : 0;

// ── Per-model usage (within date range) ──────────────────────
const perModel = await prisma.usageLog.groupBy({
  by: ['modelId'],
  where,
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

const modelIds = perModel.map((p) => p.modelId);
const models = modelIds.length
  ? await prisma.aIModel.findMany({
      where: { id: { in: modelIds } },
      select: {
        id: true, name: true, provider: true,
        inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
      },
    })
  : [];
const modelById = new Map(models.map((m) => [m.id, m]));

// Roll up by provider
const byProvider = new Map();
for (const row of perModel) {
  const model = modelById.get(row.modelId);
  if (!model) continue;
  const prov = model.provider;
  if (!byProvider.has(prov)) {
    byProvider.set(prov, {
      provider: prov,
      queries: 0,
      tokensInput: 0,
      tokensOutput: 0,
      totalTokens: 0,
      providerCost: 0,
      customerPrice: 0,
      models: [],
    });
  }
  const p = byProvider.get(prov);
  p.queries += row._count._all || 0;
  p.tokensInput += row._sum.tokensInput || 0;
  p.tokensOutput += row._sum.tokensOutput || 0;
  p.totalTokens += row._sum.totalTokens || 0;
  p.providerCost += Number(row._sum.providerCost || 0);
  p.customerPrice += Number(row._sum.customerPrice || 0);
  p.models.push({
    name: model.name,
    inputTokenPrice: Number(model.inputTokenPrice),
    outputTokenPrice: Number(model.outputTokenPrice),
    markupPercentage: Number(model.markupPercentage),
    queries: row._count._all || 0,
    tokensInput: row._sum.tokensInput || 0,
    tokensOutput: row._sum.tokensOutput || 0,
    totalTokens: row._sum.totalTokens || 0,
    providerCost: Number(row._sum.providerCost || 0),
    customerPrice: Number(row._sum.customerPrice || 0),
  });
}

// ── Top users globally (optional) ────────────────────────────
let topUsers = [];
if (topN > 0) {
  const userAgg = await prisma.usageLog.groupBy({
    by: ['userId'],
    where,
    _count: { _all: true },
    _sum: { totalTokens: true, providerCost: true, customerPrice: true },
    orderBy: { _sum: { customerPrice: 'desc' } },
    take: topN,
  });
  const userIds = userAgg.map((u) => u.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, organization: { select: { name: true, tier: true } } },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  topUsers = userAgg.map((u) => ({
    ...u,
    user: userById.get(u.userId),
  }));
}

// ── Formatting helpers ───────────────────────────────────────
const usd = (n) => `$${Number(n).toFixed(4)}`;
const usdFine = (n) => `$${Number(n).toFixed(6)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (n) => `${Number(n).toFixed(2)}%`;
const line = '═'.repeat(72);
const dash = '─'.repeat(72);

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

// Compare platform-recorded cost against provider's public pricing model
// (just the per-provider share of the platform total)
const providerShare = (providerCogs) => totCOGS > 0 ? (providerCogs / totCOGS) * 100 : 0;

// ── Output ───────────────────────────────────────────────────
console.log('');
console.log(line);
console.log('  PROVIDER RECONCILIATION REPORT');
console.log(`  Period:  ${periodLabel}`);
console.log(`  Generated: ${new Date().toISOString()}`);
console.log(line);
console.log('');

console.log('  PLATFORM TOTALS');
console.log(dash);
console.log(`  Queries:        ${num(totQueries)}`);
console.log(`  Input tokens:   ${num(totInput)}`);
console.log(`  Output tokens:  ${num(totOutput)}`);
console.log(`  Total tokens:   ${num(totTokens)}`);
console.log(`  Provider COGS:  ${usd(totCOGS)}   ← what ConvoiaAI owes upstream (calculated)`);
console.log(`  Customer rev:   ${usd(totRev)}   ← what users were billed`);
console.log(`  Profit:         ${usd(totProfit)}`);
console.log(`  Margin:         ${pct(totMargin)}`);
console.log('');

if (byProvider.size === 0) {
  console.log('  No usage in this period.');
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('  BY PROVIDER  (sorted by COGS — highest bill first)');
console.log(dash);
console.log(
  '  ' +
  pad('provider', 13) +
  rpad('queries', 8) +
  rpad('input tok', 14) +
  rpad('output tok', 13) +
  rpad('COGS', 12) +
  rpad('revenue', 12) +
  rpad('margin', 9)
);
console.log(dash);

const sortedProviders = [...byProvider.values()].sort((a, b) => b.providerCost - a.providerCost);

for (const p of sortedProviders) {
  const profit = p.customerPrice - p.providerCost;
  const margin = p.customerPrice > 0 ? (profit / p.customerPrice) * 100 : 0;
  console.log(
    '  ' +
    pad(p.provider, 13) +
    rpad(num(p.queries), 8) +
    rpad(num(p.tokensInput), 14) +
    rpad(num(p.tokensOutput), 13) +
    rpad(usd(p.providerCost), 12) +
    rpad(usd(p.customerPrice), 12) +
    rpad(pct(margin), 9)
  );
}
console.log('');

console.log('  RECONCILIATION CHECKLIST');
console.log(dash);
console.log('  For each provider above, pull the actual invoice for this');
console.log('  period and compare against the COGS column. Flag any row');
console.log('  where the delta is > 5% — that indicates either:');
console.log('    • DB pricing drift (AIModel table out of date)');
console.log('    • Token-count disagreement (provider counts differ from ours)');
console.log('    • Missing usage logs (fallback calls not recorded)');
console.log('');
for (const p of sortedProviders) {
  console.log(
    '  ' +
    pad(`${p.provider}:`, 14) +
    `platform says ${usd(p.providerCost)} (${pct(providerShare(p.providerCost))} of total COGS)`
  );
}
console.log('');

if (showModels) {
  console.log('  BY MODEL WITHIN EACH PROVIDER');
  console.log(dash);
  for (const p of sortedProviders) {
    console.log(`  ${p.provider.toUpperCase()}`);
    const sortedModels = p.models.sort((a, b) => b.providerCost - a.providerCost);
    for (const m of sortedModels) {
      const margin = m.customerPrice > 0 ? ((m.customerPrice - m.providerCost) / m.customerPrice) * 100 : 0;
      console.log(`    ${m.name}`);
      console.log(
        `      ${num(m.queries)} queries  ·  in ${num(m.tokensInput)} / out ${num(m.tokensOutput)}`
      );
      console.log(
        `      DB pricing: $${m.inputTokenPrice}/1M in  ·  $${m.outputTokenPrice}/1M out  ·  markup ${m.markupPercentage}%`
      );
      console.log(
        `      COGS ${usdFine(m.providerCost)}  ·  revenue ${usdFine(m.customerPrice)}  ·  margin ${pct(margin)}`
      );
    }
    console.log('');
  }
}

if (topN > 0 && topUsers.length > 0) {
  console.log(`  TOP ${topN} USERS BY REVENUE`);
  console.log(dash);
  for (let i = 0; i < topUsers.length; i++) {
    const u = topUsers[i];
    const who = u.user
      ? `${u.user.email}${u.user.name ? ` (${u.user.name})` : ''}`
      : `<deleted user ${u.userId}>`;
    const org = u.user?.organization ? ` · ${u.user.organization.name} (${u.user.organization.tier})` : '';
    const cp = Number(u._sum.customerPrice || 0);
    const pc = Number(u._sum.providerCost || 0);
    const profit = cp - pc;
    const margin = cp > 0 ? (profit / cp) * 100 : 0;
    console.log(`  ${i + 1}. ${who}${org}`);
    console.log(
      `     ${u._count._all} queries  ·  ${num(u._sum.totalTokens || 0)} tokens  ·  COGS ${usdFine(pc)}  ·  rev ${usdFine(cp)}  ·  margin ${pct(margin)}`
    );
  }
  console.log('');
}

console.log(line);
console.log('');

await prisma.$disconnect();
