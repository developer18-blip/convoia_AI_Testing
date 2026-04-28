// One-off migration: bump claude-opus-4-7 contextWindow 200K → 1M
// Probes (2026-04-28) verified ≥360K input accepted. 1M matches
// Anthropic's published advertising. Auto-router only triggers when
// input > contextWindow, so worst case if 4.7's actual ceiling is
// below 1M is a rare 400 on >1M queries — easy recovery.
//
// Run: cd backend && npx tsx scripts/bump-opus-47-context.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.aIModel.findFirst({
    where: { modelId: 'claude-opus-4-7' },
    select: { modelId: true, contextWindow: true },
  });

  if (!before) {
    console.error('FAIL: claude-opus-4-7 not found in AIModel table');
    process.exit(1);
  }

  console.log('Before:', before);

  if (before.contextWindow === 1000000) {
    console.log('Already at 1M — no change needed');
    return;
  }

  const after = await prisma.aIModel.update({
    where: { modelId: 'claude-opus-4-7' },
    data: { contextWindow: 1000000 },
    select: { modelId: true, contextWindow: true },
  });

  console.log('After:', after);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
