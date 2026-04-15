// Complete Perplexity usage history — everything currently logged
// in UsageLog where the model is a Perplexity model.
//
// IMPORTANT: Perplexity calls fired by the internal web-search
// backend (searchWeb → searchPerplexity) were NOT logged to UsageLog
// before commit 4fa23ac. Any Perplexity API calls that happened
// via web search before that commit deployed are permanently
// unrecoverable from the database. Use perplexity-historical.mjs
// for a heuristic estimate of who likely triggered them.
//
// This script only reports what is actually in the DB.
//
// Usage:
//   node scripts/perplexity-history.mjs                 # full output
//   node scripts/perplexity-history.mjs --no-detail     # skip per-row list
//   node scripts/perplexity-history.mjs --since 7d      # last 7 days only

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── CLI args ─────────────────────────────────────────────
const args = process.argv.slice(2);
let showDetail = true;
let sinceRaw = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--no-detail') showDetail = false;
  else if (args[i] === '--since' && args[i + 1]) sinceRaw = args[++i];
}
function parseTime(s) {
  if (!s) return null;
  const rel = /^(\d+)([hd])$/.exec(s);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const ms = rel[2] === 'h' ? n * 3600_000 : n * 86_400_000;
    return new Date(Date.now() - ms);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00Z');
  const d = new Date(s);
  if (isNaN(d.getTime())) { console.error(`Invalid --since: ${s}`); process.exit(1); }
  return d;
}
const since = parseTime(sinceRaw);

// ── Find all Perplexity models ────────────────────────────
const pplxModels = await prisma.aIModel.findMany({
  where: { provider: 'perplexity' },
  select: {
    id: true, name: true, modelId: true,
    inputTokenPrice: true, outputTokenPrice: true,
    reasoningTokenPrice: true, perQueryFee: true,
    markupPercentage: true, isActive: true,
  },
});

const line = '═'.repeat(90);
const dash = '─'.repeat(90);
const usd = (n) => `$${Number(n).toFixed(6)}`;
const usd4 = (n) => `$${Number(n).toFixed(4)}`;
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (n) => `${Number(n).toFixed(2)}%`;
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const dtStr = (d) => d ? new Date(d).toISOString().replace('T', ' ').substring(0, 19) : '—';
const dayStr = (d) => d ? new Date(d).toISOString().split('T')[0] : '—';

console.log('');
console.log(line);
console.log('  PERPLEXITY COMPLETE HISTORY  (everything in UsageLog)');
console.log(`  Scope: ${since ? `since ${since.toISOString()}` : 'all time'}`);
console.log(`  Generated: ${new Date().toISOString()}`);
console.log(line);
console.log('');

console.log('  REGISTERED PERPLEXITY MODELS IN AIModel TABLE');
console.log(dash);
if (pplxModels.length === 0) {
  console.log('  ✗ NO Perplexity rows found in AIModel table.');
  console.log('    Every Perplexity API call (chat + web search) is invisible');
  console.log('    to billing. Seed the table before anything else can work.');
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}
for (const m of pplxModels) {
  const status = m.isActive ? 'active' : 'DISABLED';
  const inP = Number(m.inputTokenPrice) * 1e6;
  const outP = Number(m.outputTokenPrice) * 1e6;
  const reasP = Number(m.reasoningTokenPrice || 0) * 1e6;
  const feeP = Number(m.perQueryFee || 0);
  console.log(`  ${pad(m.name, 24)} (${m.modelId})  [${status}]`);
  console.log(`    in=$${inP.toFixed(2)}/1M  out=$${outP.toFixed(2)}/1M  reasoning=$${reasP.toFixed(2)}/1M  per-query=$${feeP.toFixed(4)}  markup=${m.markupPercentage}%`);
}
console.log('');

const pplxModelIds = pplxModels.map((m) => m.id);
const modelById = new Map(pplxModels.map((m) => [m.id, m]));

// ── All Perplexity UsageLog rows (within window if any) ─
const whereClause = { modelId: { in: pplxModelIds } };
if (since) whereClause.createdAt = { gte: since };

const allRows = await prisma.usageLog.findMany({
  where: whereClause,
  orderBy: { createdAt: 'desc' },
  include: {
    user: { select: { email: true, name: true, organization: { select: { name: true, tier: true } } } },
  },
});

console.log(`  ⚠  DATA RELIABILITY WARNING`);
console.log(dash);
console.log('  Any Perplexity API call fired by the internal web-search');
console.log('  backend (searchWeb → searchPerplexity) BEFORE commit 4fa23ac');
console.log('  produced ZERO UsageLog rows — the cost was eaten as opex.');
console.log('  After that commit, every Perplexity call is logged.');
console.log('  For an estimate of pre-logging internal searches, run:');
console.log('    node scripts/perplexity-historical.mjs');
console.log('');

if (allRows.length === 0) {
  console.log(`  ${since ? 'No Perplexity rows in this window.' : 'No Perplexity rows in UsageLog at all.'}`);
  console.log('');
  await prisma.$disconnect();
  process.exit(0);
}

// ── Lifetime totals ──────────────────────────────────────
let totQueries = 0, totIn = 0, totOut = 0, totReasoning = 0, totSearches = 0;
let totCogs = 0, totRev = 0;
for (const r of allRows) {
  totQueries++;
  totIn += r.tokensInput || 0;
  totOut += r.tokensOutput || 0;
  totReasoning += r.reasoningTokens || 0;
  totSearches += r.searchQueries || 0;
  totCogs += Number(r.providerCost || 0);
  totRev += Number(r.customerPrice || 0);
}
const totProfit = totRev - totCogs;
const totMargin = totRev > 0 ? (totProfit / totRev) * 100 : 0;

console.log('  LIFETIME TOTALS (logged Perplexity rows only)');
console.log(dash);
console.log(`  Queries:           ${num(totQueries)}`);
console.log(`  Input tokens:      ${num(totIn)}`);
console.log(`  Output tokens:     ${num(totOut)}`);
console.log(`  Reasoning tokens:  ${num(totReasoning)}   ${totReasoning === 0 ? '(0 — reasoning capture only active after commit 4fa23ac)' : ''}`);
console.log(`  Search queries:    ${num(totSearches)}   ${totSearches === 0 ? '(0 — per-query fee tracking only active after commit 4fa23ac)' : ''}`);
console.log(`  Provider COGS:     ${usd(totCogs)}`);
console.log(`  Customer revenue:  ${usd(totRev)}`);
console.log(`  Profit:            ${usd(totProfit)}`);
console.log(`  Margin:            ${pct(totMargin)}`);
console.log('');

// ── By day ───────────────────────────────────────────────
const byDay = new Map();
for (const r of allRows) {
  const d = dayStr(r.createdAt);
  if (!byDay.has(d)) byDay.set(d, { queries: 0, tokens: 0, cogs: 0, rev: 0 });
  const b = byDay.get(d);
  b.queries++;
  b.tokens += r.totalTokens || 0;
  b.cogs += Number(r.providerCost || 0);
  b.rev += Number(r.customerPrice || 0);
}
console.log(`  BY DAY  (${byDay.size} days)`);
console.log(dash);
console.log('  ' + pad('date', 14) + rpad('queries', 9) + rpad('tokens', 14) + rpad('COGS', 13) + rpad('revenue', 13) + rpad('profit', 13));
console.log(dash);
const sortedDays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [d, b] of sortedDays) {
  console.log('  ' + pad(d, 14) + rpad(num(b.queries), 9) + rpad(num(b.tokens), 14) + rpad(usd4(b.cogs), 13) + rpad(usd4(b.rev), 13) + rpad(usd4(b.rev - b.cogs), 13));
}
console.log('');

// ── By user ──────────────────────────────────────────────
const byUser = new Map();
for (const r of allRows) {
  const key = r.userId;
  if (!byUser.has(key)) byUser.set(key, { user: r.user, queries: 0, tokens: 0, cogs: 0, rev: 0 });
  const b = byUser.get(key);
  b.queries++;
  b.tokens += r.totalTokens || 0;
  b.cogs += Number(r.providerCost || 0);
  b.rev += Number(r.customerPrice || 0);
}
console.log(`  BY USER  (${byUser.size} users)`);
console.log(dash);
const sortedUsers = [...byUser.values()].sort((a, b) => b.rev - a.rev);
for (let i = 0; i < sortedUsers.length; i++) {
  const u = sortedUsers[i];
  const email = u.user?.email || '<deleted user>';
  const org = u.user?.organization ? ` · ${u.user.organization.name} [${u.user.organization.tier}]` : '';
  const margin = u.rev > 0 ? ((u.rev - u.cogs) / u.rev) * 100 : 0;
  console.log(`  ${i + 1}. ${email}${org}`);
  console.log(`     ${num(u.queries)} queries  ·  ${num(u.tokens)} tokens  ·  COGS ${usd4(u.cogs)}  ·  rev ${usd4(u.rev)}  ·  margin ${pct(margin)}`);
}
console.log('');

// ── By model ─────────────────────────────────────────────
const byModel = new Map();
for (const r of allRows) {
  const key = r.modelId;
  if (!byModel.has(key)) byModel.set(key, { queries: 0, tokens: 0, cogs: 0, rev: 0, reasoning: 0, searches: 0 });
  const b = byModel.get(key);
  b.queries++;
  b.tokens += r.totalTokens || 0;
  b.reasoning += r.reasoningTokens || 0;
  b.searches += r.searchQueries || 0;
  b.cogs += Number(r.providerCost || 0);
  b.rev += Number(r.customerPrice || 0);
}
console.log(`  BY MODEL  (${byModel.size} models)`);
console.log(dash);
const sortedModels = [...byModel.entries()].sort((a, b) => b[1].cogs - a[1].cogs);
for (const [modelId, b] of sortedModels) {
  const m = modelById.get(modelId);
  const name = m?.name || `<deleted ${modelId.substring(0, 8)}>`;
  const margin = b.rev > 0 ? ((b.rev - b.cogs) / b.rev) * 100 : 0;
  console.log(`  ${pad(name, 26)} ${rpad(num(b.queries), 6)}q  ${rpad(num(b.tokens), 10)}t  reasoning=${num(b.reasoning)}  searches=${num(b.searches)}`);
  console.log(`    COGS ${usd4(b.cogs).padStart(11)}  rev ${usd4(b.rev).padStart(11)}  profit ${usd4(b.rev - b.cogs).padStart(11)}  margin ${pct(margin).padStart(7)}`);
}
console.log('');

// ── Every row (detailed log) ─────────────────────────────
if (showDetail) {
  console.log(`  COMPLETE ROW LISTING  (${allRows.length} rows, newest first)`);
  console.log(dash);
  console.log('  ' + pad('timestamp', 20) + pad('user', 28) + pad('model', 18) + rpad('tokens', 9) + rpad('COGS', 12) + rpad('revenue', 12));
  console.log(dash);
  for (const r of allRows) {
    const m = modelById.get(r.modelId);
    const modelName = m?.name?.substring(0, 17) || '<?>';
    const email = (r.user?.email || '<deleted>').substring(0, 27);
    console.log(
      '  ' +
        pad(dtStr(r.createdAt), 20) +
        pad(email, 28) +
        pad(modelName, 18) +
        rpad(num(r.totalTokens || 0), 9) +
        rpad(usd(r.providerCost || 0).substring(0, 11), 12) +
        rpad(usd(r.customerPrice || 0).substring(0, 11), 12)
    );
    // Show reasoning + search on a second line if present
    if ((r.reasoningTokens || 0) > 0 || (r.searchQueries || 0) > 0) {
      console.log(`      reasoning=${num(r.reasoningTokens || 0)} tokens  ·  search queries=${num(r.searchQueries || 0)}  ·  prompt="${(r.prompt || '').substring(0, 60).replace(/\s+/g, ' ')}"`);
    }
  }
  console.log('');
}

console.log(line);
console.log('');

await prisma.$disconnect();
