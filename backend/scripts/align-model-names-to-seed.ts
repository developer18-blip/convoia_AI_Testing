import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// modelId → canonical name as used in prisma/seed.ts
const CANONICAL: Record<string, string> = {
  'gpt-4o-mini': 'GPT-4o Mini',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'deepseek-chat': 'DeepSeek Chat',
  'mistral-large-latest': 'Mistral Large',
}

async function main() {
  for (const [modelId, canonicalName] of Object.entries(CANONICAL)) {
    const row = await prisma.aIModel.findUnique({ where: { modelId } })
    if (!row) {
      console.log(`SKIP: no row with modelId="${modelId}"`)
      continue
    }
    if (row.name === canonicalName) {
      console.log(`OK:   modelId="${modelId}" already named "${canonicalName}"`)
      continue
    }
    const existingWithTargetName = await prisma.aIModel.findUnique({ where: { name: canonicalName } })
    if (existingWithTargetName) {
      console.log(`CONFLICT: modelId="${modelId}" → cannot rename to "${canonicalName}" (another row already uses that name)`)
      continue
    }
    await prisma.aIModel.update({
      where: { id: row.id },
      data: { name: canonicalName },
    })
    console.log(`RENAMED: "${row.name}" → "${canonicalName}" (modelId="${modelId}")`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
