import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const all = await prisma.aIModel.findMany({
    select: { id: true, modelId: true, name: true, provider: true, isActive: true, updatedAt: true, createdAt: true },
    orderBy: [{ modelId: 'asc' }, { updatedAt: 'desc' }],
  })

  const groups = new Map<string, typeof all>()
  for (const m of all) {
    const existing = groups.get(m.modelId) || []
    existing.push(m)
    groups.set(m.modelId, existing)
  }

  const dupes = [...groups.entries()].filter(([, rows]) => rows.length > 1)
  console.log(`Total AIModel rows: ${all.length}`)
  console.log(`Unique modelId values: ${groups.size}`)
  console.log(`modelId values with duplicates: ${dupes.length}`)
  console.log('')

  if (dupes.length === 0) {
    console.log('No duplicates — nothing to clean. (Odd that prisma db push still complained.)')
    return
  }

  console.log('Duplicate groups (keeper = most recent updatedAt, will be kept):')
  for (const [modelId, rows] of dupes) {
    const [keeper, ...losers] = rows
    console.log(`\n  modelId="${modelId}" (${rows.length} rows)`)
    console.log(`    KEEP   id=${keeper.id} name="${keeper.name}" active=${keeper.isActive} updated=${keeper.updatedAt.toISOString()}`)
    for (const l of losers) {
      console.log(`    DELETE id=${l.id} name="${l.name}" active=${l.isActive} updated=${l.updatedAt.toISOString()}`)
    }
  }

  const toDeleteIds = dupes.flatMap(([, rows]) => rows.slice(1).map(r => r.id))
  console.log(`\nTotal rows to delete: ${toDeleteIds.length}`)

  // Check what other tables reference these (FK impact)
  const usageRefs = await prisma.usageLog.count({ where: { modelId: { in: toDeleteIds } } })
  const agentRefs = await (prisma as any).agent.count({ where: { modelId: { in: toDeleteIds } } }).catch(() => 0)
  console.log(`\nFK references to rows we'd delete:`)
  console.log(`  UsageLog rows: ${usageRefs}`)
  console.log(`  Agent rows:    ${agentRefs}`)
  console.log(`\nRe-run with --delete to actually perform the cleanup.`)

  if (process.argv.includes('--delete')) {
    console.log('\n=== --delete flag set, performing cleanup ===')

    // Re-point FKs to the keeper before deleting the loser
    for (const [, rows] of dupes) {
      const [keeper, ...losers] = rows
      for (const loser of losers) {
        const ul = await prisma.usageLog.updateMany({ where: { modelId: loser.id }, data: { modelId: keeper.id } })
        const ag = await (prisma as any).agent.updateMany({ where: { modelId: loser.id }, data: { modelId: keeper.id } }).catch(() => ({ count: 0 }))
        if (ul.count || ag.count) {
          console.log(`  Repointed ${ul.count} UsageLog + ${ag.count} Agent rows from ${loser.id} to keeper ${keeper.id}`)
        }
      }
    }

    const result = await prisma.aIModel.deleteMany({ where: { id: { in: toDeleteIds } } })
    console.log(`Deleted ${result.count} duplicate AIModel rows.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
