import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const apikeyCols: Array<{ column_name: string }> = await prisma.$queryRawUnsafe(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'APIKey' AND column_name = 'keyPrefix'
  `)
  const caTable: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name = 'ConversationAttachment'
  `)
  const aiModelCount = await prisma.aIModel.count()
  const uniqueCheck: Array<{ dupes: bigint }> = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS dupes FROM (
      SELECT "modelId" FROM "AIModel" GROUP BY "modelId" HAVING COUNT(*) > 1
    ) x
  `)

  console.log(`APIKey.keyPrefix present: ${apikeyCols.length > 0 ? 'YES' : 'NO'}`)
  console.log(`ConversationAttachment table present: ${caTable.length > 0 ? 'YES' : 'NO'}`)
  console.log(`AIModel rows: ${aiModelCount}`)
  console.log(`AIModel duplicate modelIds remaining: ${uniqueCheck[0]?.dupes ?? 'unknown'}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
