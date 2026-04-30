import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  const seedPath = path.resolve(process.cwd(), 'prisma/seed.ts')
  const src = fs.readFileSync(seedPath, 'utf8')

  // Parse {name: '...', provider: '...', modelId: '...'} entries from the seed array.
  // Not a general TS parser — relies on the consistent formatting used in seed.ts.
  const entryRe = /name:\s*'([^']+)'[\s\S]*?modelId:\s*'([^']+)'/g
  const pairs: Array<{ name: string; modelId: string }> = []
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(src)) !== null) {
    pairs.push({ name: m[1], modelId: m[2] })
  }

  console.log(`Parsed ${pairs.length} (name, modelId) pairs from seed.ts.`)
  if (!pairs.length) { console.error('Extraction failed — abort.'); process.exit(1) }

  let renamed = 0, ok = 0, notInDb = 0, conflicts = 0
  for (const seed of pairs) {
    const row = await prisma.aIModel.findUnique({ where: { modelId: seed.modelId } })
    if (!row) { notInDb++; continue }
    if (row.name === seed.name) { ok++; continue }

    const clash = await prisma.aIModel.findUnique({ where: { name: seed.name } })
    if (clash && clash.id !== row.id) {
      console.log(`CONFLICT: modelId="${seed.modelId}" cannot take name "${seed.name}" (owned by modelId="${clash.modelId}")`)
      conflicts++
      continue
    }

    await prisma.aIModel.update({ where: { id: row.id }, data: { name: seed.name } })
    console.log(`RENAMED: "${row.name}" → "${seed.name}" (modelId="${seed.modelId}")`)
    renamed++
  }

  console.log(`\nDone: ${renamed} renamed, ${ok} already-correct, ${notInDb} not-in-db, ${conflicts} conflicts.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
