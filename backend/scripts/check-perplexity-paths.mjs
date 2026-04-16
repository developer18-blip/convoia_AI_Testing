import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 1. Count UsageLog rows by joined provider
const usageByProvider = await prisma.usageLog.findMany({
  select: { modelId: true, providerCost: true, customerPrice: true },
});

const allModels = await prisma.aIModel.findMany({
  select: { id: true, provider: true, name: true, modelId: true },
});
const modelById = new Map(allModels.map((m) => [m.id, m]));

const providerTotals = new Map();
let orphaned = 0;
let orphanedCOGS = 0;
let orphanedRev = 0;
const orphanIds = new Map();

for (const row of usageByProvider) {
  const m = modelById.get(row.modelId);
  if (!m) {
    orphaned++;
    orphanedCOGS += Number(row.providerCost || 0);
    orphanedRev += Number(row.customerPrice || 0);
    orphanIds.set(row.modelId, (orphanIds.get(row.modelId) || 0) + 1);
    continue;
  }
  const p = m.provider;
  if (!providerTotals.has(p)) {
    providerTotals.set(p, { queries: 0, cogs: 0, rev: 0 });
  }
  const t = providerTotals.get(p);
  t.queries++;
  t.cogs += Number(row.providerCost || 0);
  t.rev += Number(row.customerPrice || 0);
}

console.log(`\nTotal UsageLog rows: ${usageByProvider.length}`);
console.log(`\nBy provider (from AIModel join):`);
for (const [p, t] of providerTotals) {
  console.log(`  ${p.padEnd(12)} ${t.queries.toString().padStart(6)} queries  ·  COGS $${t.cogs.toFixed(4)}  ·  rev $${t.rev.toFixed(4)}`);
}
console.log(`\nOrphaned rows (modelId not in AIModel): ${orphaned}`);
console.log(`  COGS $${orphanedCOGS.toFixed(4)}  ·  rev $${orphanedRev.toFixed(4)}`);
if (orphanIds.size > 0) {
  console.log(`  Unique orphan modelIds: ${orphanIds.size}`);
  for (const [id, count] of orphanIds) {
    console.log(`    ${id}  (${count} rows)`);
  }
}

// 2. Check sonar- anywhere in usage log raw provider field if it exists
// Also check if UsageLog has a provider column directly
console.log('\nChecking UsageLog schema for provider field...');
try {
  const sample = await prisma.usageLog.findFirst({ select: { provider: true } });
  console.log('  Has provider field. Sample:', sample);
  const byProv = await prisma.usageLog.groupBy({
    by: ['provider'],
    _count: { _all: true },
    _sum: { providerCost: true, customerPrice: true, totalTokens: true },
  });
  console.log('\nUsageLog.provider groupBy:');
  for (const row of byProv) {
    console.log(`  ${(row.provider || '<null>').padEnd(14)} ${(row._count._all || 0).toString().padStart(6)} queries  ·  ${(row._sum.totalTokens || 0).toString().padStart(10)} tokens  ·  COGS $${Number(row._sum.providerCost || 0).toFixed(4)}  ·  rev $${Number(row._sum.customerPrice || 0).toFixed(4)}`);
  }
} catch (e) {
  console.log('  No provider field on UsageLog:', e.message);
}

await prisma.$disconnect();
