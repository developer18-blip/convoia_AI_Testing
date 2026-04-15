// Anthropic / Claude usage report across the entire platform.
//
// Reports every Claude call in UsageLog, broken down by:
//   1. Platform totals (all Anthropic)
//   2. Per model (Claude Opus / Sonnet / Haiku / etc.)
//   3. Per user (every user with non-zero Claude usage)
//   4. Per model within each user (top spenders only, see --top)
//
// Columns shown for each row: queries, tokens, providerCost (COGS),
// customerPrice (what we billed), profit, margin.
//
// Usage:
//   node scripts/anthropic-usage.mjs            # show all users
//   node scripts/anthropic-usage.mjs --top 10   # only top 10 by revenue
//   node scripts/anthropic-usage.mjs --breakdown  # per-model within each user

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── CLI args ────────────────────────────────────────────
// --top N         limit to top N users by revenue
// --breakdown     show per-model breakdown inside each user
// --since STR     filter UsageLog.createdAt >= STR
//                 accepts: "YYYY-MM-DD", "YYYY-MM-DD HH:MM", full ISO,
//                 or relative shorthand "24h" / "48h" / "7d"
// --until STR     filter UsageLog.createdAt < STR (same formats)
const args = process.argv.slice(2);
let topN = 0;
let showBreakdown = false;
let sinceRaw = null;
let untilRaw = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--top' && args[i + 1]) { topN = parseInt(args[++i], 10) || 0; }
  else if (args[i] === '--breakdown') { showBreakdown = true; }
  else if (args[i] === '--since' && args[i + 1]) { sinceRaw = args[++i]; }
  else if (args[i] === '--until' && args[i + 1]) { untilRaw = args[++i]; }
}

function parseTimeArg(s) {
  if (!s) return null;
  const rel = /^(\d+)([hd])$/.exec(s);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const ms = rel[2] === 'h' ? n * 3600_000 : n * 86_400_000;
    return new Date(Date.now() - ms);
  }
  // "YYYY-MM-DD HH:MM" → treat as UTC so it's unambiguous
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
    return new Date(s.replace(' ', 'T') + ':00Z');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + 'T00:00:00Z');
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    console.error(`Invalid time argument: "${s}". Use YYYY-MM-DD, "YYYY-MM-DD HH:MM", ISO, or 24h/7d.`);
    process.exit(1);
  }
  return d;
}

const since = parseTimeArg(sinceRaw);
const until = parseTimeArg(untilRaw);

// Build the date filter object reused in every query
const dateFilter = {};
if (since) dateFilter.gte = since;
if (until) dateFilter.lt = until;
const hasTimeWindow = !!(since || until);

// ── Find all Anthropic models ──────────────────────────
const anthropicModels = await prisma.aIModel.findMany({
  where: { provider: 'anthropic' },
  select: {
    id: true, name: true, modelId: true,
    inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
    isActive: true,
  },
});

if (anthropicModels.length === 0) {
  console.log('No Anthropic models found in AIModel table.');
  await prisma.$disconnect();
  process.exit(0);
}

const anthropicModelIds = anthropicModels.map((m) => m.id);
const modelById = new Map(anthropicModels.map((m) => [m.id, m]));

// Base WHERE clause reused across all queries so --since / --until
// slice UsageLog identically everywhere.
const anthropicWhere = { modelId: { in: anthropicModelIds } };
if (hasTimeWindow) anthropicWhere.createdAt = dateFilter;

// ── Platform totals for Anthropic ──────────────────────
const total = await prisma.usageLog.aggregate({
  where: anthropicWhere,
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

// ── Per model breakdown ────────────────────────────────
const perModel = await prisma.usageLog.groupBy({
  by: ['modelId'],
  where: anthropicWhere,
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
    totalTokens: true,
    providerCost: true,
    customerPrice: true,
  },
});

// ── Per user breakdown ─────────────────────────────────
const perUser = await prisma.usageLog.groupBy({
  by: ['userId'],
  where: anthropicWhere,
  _count: { _all: true },
  _sum: {
    tokensInput: true,
    tokensOutput: true,
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
        id: true, email: true, name: true, role: true, isActive: true,
        organization: { select: { name: true, tier: true, industry: true } },
      },
    })
  : [];
const userById = new Map(users.map((u) => [u.id, u]));

// ── Per-user-per-model (for --breakdown) ───────────────
let perUserModel = [];
if (showBreakdown && userIds.length) {
  const limitUserIds = topN > 0 ? userIds.slice(0, topN) : userIds;
  const breakdownWhere = {
    userId: { in: limitUserIds },
    modelId: { in: anthropicModelIds },
  };
  if (hasTimeWindow) breakdownWhere.createdAt = dateFilter;
  perUserModel = await prisma.usageLog.groupBy({
    by: ['userId', 'modelId'],
    where: breakdownWhere,
    _count: { _all: true },
    _sum: {
      totalTokens: true,
      providerCost: true,
      customerPrice: true,
    },
  });
}

// ── First / last usage (within window if set) ─────────
const firstUsage = await prisma.usageLog.findFirst({
  where: anthropicWhere,
  orderBy: { createdAt: 'asc' },
  select: { createdAt: true },
});
const lastUsage = await prisma.usageLog.findFirst({
  where: anthropicWhere,
  orderBy: { createdAt: 'desc' },
  select: { createdAt: true },
});

// ── Platform-wide totals (for share %) ─────────────────
// Apply same time window so "share of platform" compares apples to apples.
const platformWhere = hasTimeWindow ? { createdAt: dateFilter } : {};
const platformTotal = await prisma.usageLog.aggregate({
  where: platformWhere,
  _count: { _all: true },
  _sum: { providerCost: true, customerPrice: true },
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

// ── Formatters ─────────────────────────────────────────
const usd = (n) => `$${Number(n).toFixed(6)}`;
const usd4 = (n) => `$${Number(n).toFixed(4)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (n) => `${Number(n).toFixed(2)}%`;
const dtStr = (d) => d ? new Date(d).toISOString().split('T')[0] : '—';
const line = '═'.repeat(82);
const dash = '─'.repeat(82);
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

// ── Output ─────────────────────────────────────────────
console.log('');
console.log(line);
const periodLabel = (() => {
  if (since && until) return `${since.toISOString()} → ${until.toISOString()}`;
  if (since) return `since ${since.toISOString()}`;
  if (until) return `until ${until.toISOString()}`;
  return 'all time';
})();

console.log('  ANTHROPIC / CLAUDE USAGE REPORT');
console.log(`  Scope: entire platform · all users · ${periodLabel}`);
console.log(`  Generated: ${new Date().toISOString()}`);
console.log(line);
console.log('');

console.log('  REGISTERED CLAUDE MODELS  (DB pricing, not Anthropic\'s actual pricing)');
console.log(dash);
for (const m of anthropicModels) {
  const status = m.isActive ? 'active' : 'DISABLED';
  const inPer1M = Number(m.inputTokenPrice) * 1e6;
  const outPer1M = Number(m.outputTokenPrice) * 1e6;
  console.log(`  ${pad(m.name, 28)} (${m.modelId})  [${status}]`);
  console.log(`    DB pricing: $${inPer1M.toFixed(2)}/1M in · $${outPer1M.toFixed(2)}/1M out · markup ${m.markupPercentage}%`);
}
console.log('');

console.log('  PLATFORM TOTALS  (Anthropic only)');
console.log(dash);
if (firstUsage && lastUsage) {
  console.log(`  Activity window:   ${dtStr(firstUsage.createdAt)}  →  ${dtStr(lastUsage.createdAt)}`);
}
console.log(`  Queries:           ${num(totQueries)}`);
console.log(`  Input tokens:      ${num(totInput)}`);
console.log(`  Output tokens:     ${num(totOutput)}`);
console.log(`  Total tokens:      ${num(totTokens)}`);
console.log(`  Provider COGS:     ${usd(totCOGS)}   ← what ConvoiaAI owes Anthropic`);
console.log(`  Customer revenue:  ${usd(totRev)}   ← what users were billed`);
console.log(`  Profit:            ${usd(totProfit)}`);
console.log(`  Margin:            ${pct(totMargin)}`);
console.log('');

console.log('  SHARE OF PLATFORM  (Anthropic vs everything)');
console.log(dash);
const queryShare = platformQueries > 0 ? (totQueries / platformQueries) * 100 : 0;
const cogsShare = platformCOGS > 0 ? (totCOGS / platformCOGS) * 100 : 0;
const revShare = platformRev > 0 ? (totRev / platformRev) * 100 : 0;
console.log(`  Query share:       ${num(totQueries)} / ${num(platformQueries)}  (${pct(queryShare)})`);
console.log(`  COGS share:        ${usd4(totCOGS)} / ${usd4(platformCOGS)}  (${pct(cogsShare)})`);
console.log(`  Revenue share:     ${usd4(totRev)} / ${usd4(platformRev)}  (${pct(revShare)})`);
console.log('');

if (perModel.length === 0) {
  console.log('  No Claude usage yet.');
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('  BY MODEL  (sorted by revenue)');
console.log(dash);
console.log(
  '  ' +
    pad('model', 28) +
    rpad('queries', 8) +
    rpad('tokens', 12) +
    rpad('COGS', 12) +
    rpad('revenue', 12) +
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
      pad(name.substring(0, 27), 28) +
      rpad(num(q), 8) +
      rpad(num(t), 12) +
      rpad(usd4(pc), 12) +
      rpad(usd4(cp), 12) +
      rpad(pct(margin), 9)
  );
}
console.log('');

// ── Per user ────────────────────────────────────────────
const displayUsers = topN > 0 ? perUser.slice(0, topN) : perUser;
const label = topN > 0 ? `TOP ${topN} USERS` : `ALL ${perUser.length} USERS`;

console.log(`  ${label} BY CLAUDE REVENUE`);
console.log(dash);
console.log(
  '  ' +
    pad('#', 3) +
    pad('user', 32) +
    rpad('queries', 8) +
    rpad('tokens', 12) +
    rpad('COGS', 11) +
    rpad('revenue', 11) +
    rpad('profit', 11) +
    rpad('margin', 8)
);
console.log(dash);

let idx = 0;
for (const row of displayUsers) {
  idx++;
  const u = userById.get(row.userId);
  const email = u ? u.email : `<deleted ${row.userId.substring(0, 8)}>`;
  const q = row._count._all || 0;
  const t = row._sum.totalTokens || 0;
  const pc = Number(row._sum.providerCost || 0);
  const cp = Number(row._sum.customerPrice || 0);
  const profit = cp - pc;
  const margin = cp > 0 ? (profit / cp) * 100 : 0;
  console.log(
    '  ' +
      pad(String(idx), 3) +
      pad(email.substring(0, 31), 32) +
      rpad(num(q), 8) +
      rpad(num(t), 12) +
      rpad(usd4(pc), 11) +
      rpad(usd4(cp), 11) +
      rpad(usd4(profit), 11) +
      rpad(pct(margin), 8)
  );
  if (u?.organization) {
    console.log(`      ${u.organization.name} [${u.organization.tier}]${u.organization.industry ? ' · ' + u.organization.industry : ''}`);
  }
}
console.log('');

// ── Per-user per-model breakdown (if requested) ─────────
if (showBreakdown && perUserModel.length > 0) {
  console.log(`  BREAKDOWN — Claude models per user (top ${topN || perUser.length} users)`);
  console.log(dash);

  // Group by userId → list of model rows
  const byUser = new Map();
  for (const row of perUserModel) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, []);
    byUser.get(row.userId).push(row);
  }

  const orderedUserIds = displayUsers.map((u) => u.userId);
  for (const userId of orderedUserIds) {
    const u = userById.get(userId);
    const email = u ? u.email : `<deleted ${userId.substring(0, 8)}>`;
    const userModels = (byUser.get(userId) || [])
      .map((r) => ({ ...r, model: modelById.get(r.modelId) }))
      .sort((a, b) => Number(b._sum.customerPrice || 0) - Number(a._sum.customerPrice || 0));

    if (userModels.length === 0) continue;
    console.log(`  ${email}`);
    for (const m of userModels) {
      const name = m.model?.name || `<deleted ${m.modelId.substring(0, 8)}>`;
      const q = m._count._all || 0;
      const t = m._sum.totalTokens || 0;
      const pc = Number(m._sum.providerCost || 0);
      const cp = Number(m._sum.customerPrice || 0);
      const profit = cp - pc;
      const margin = cp > 0 ? (profit / cp) * 100 : 0;
      console.log(`    ${pad(name, 26)} ${rpad(num(q), 6)}q  ${rpad(num(t), 10)}t  COGS ${usd4(pc).padStart(11)}  rev ${usd4(cp).padStart(11)}  profit ${usd4(profit).padStart(11)}  ${pct(margin).padStart(7)}`);
    }
    console.log('');
  }
}

console.log(line);
console.log('');

await prisma.$disconnect();
