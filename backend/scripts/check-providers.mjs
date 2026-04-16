import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const providers = await prisma.aIModel.groupBy({
  by: ['provider'],
  _count: { _all: true },
});
console.log('\nProviders in AIModel:');
for (const p of providers) {
  console.log(`  ${p.provider}  (${p._count._all} models)`);
}

// Also look for any model whose name/modelId contains "sonar" or "perplex"
const pplxLike = await prisma.aIModel.findMany({
  where: {
    OR: [
      { modelId: { contains: 'sonar', mode: 'insensitive' } },
      { name: { contains: 'perplex', mode: 'insensitive' } },
      { provider: { contains: 'perplex', mode: 'insensitive' } },
    ],
  },
  select: { id: true, provider: true, name: true, modelId: true, isActive: true },
});
console.log('\nPerplexity-like models:');
for (const m of pplxLike) {
  console.log(`  [${m.provider}] ${m.name} (${m.modelId}) ${m.isActive ? '' : '[disabled]'}`);
}

await prisma.$disconnect();
