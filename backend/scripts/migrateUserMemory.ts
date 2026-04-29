import { PrismaClient, FactCategory, FactSource } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

interface ReformulatedFact {
  category: FactCategory;
  content: string;
  confidence: number;
}

interface ReformulationResult {
  facts: ReformulatedFact[];
  discarded_count: number;
  discard_reasons: string;
}

const TOP_OF_MIND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MAX_CONTENT_LEN = 500;
const MIN_CONFIDENCE = 0.5;

const REFORMULATION_PROMPT = `You are migrating legacy memory data. Old format: regex-extracted snippets that mix persistent facts with transient tasks. New format: clean natural-language facts with categories.

For each legacy memory, decide:
- Persistent fact -> reformulate cleanly into 1 fact
- Transient task description -> DISCARD (e.g. "Goal: write blog about X" is a task, not a fact)
- Duplicate or conflicting -> keep best version

Output strict JSON:
{
  "facts": [
    {"category": "WORK"|"PERSONAL"|"TOP_OF_MIND"|"HISTORY", "content": "...", "confidence": 0.0-1.0}
  ],
  "discarded_count": N,
  "discard_reasons": "summary"
}

Categories:
- WORK: role, projects, tech stack, collaborators
- PERSONAL: location, preferences, communication style
- TOP_OF_MIND: current focus (will auto-expire in 14 days)
- HISTORY: past projects, completed work

Reject if too vague or contradictory across many memories.`;

async function migrateAllUsers(dryRun: boolean): Promise<void> {
  const oldMemories = await prisma.userMemory.findMany({
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
  });

  console.log(`\n=== Migration ${dryRun ? '(DRY RUN)' : '(LIVE)'} ===`);
  console.log(`Total legacy memories: ${oldMemories.length}\n`);

  const byUser: Record<string, typeof oldMemories> = {};
  for (const m of oldMemories) {
    if (!byUser[m.userId]) byUser[m.userId] = [];
    byUser[m.userId].push(m);
  }

  const results = {
    usersProcessed: 0,
    totalIn: oldMemories.length,
    totalOut: 0,
    discarded: 0,
    rejectedByValidation: 0,
    errors: [] as string[],
  };

  for (const [userId, memories] of Object.entries(byUser)) {
    try {
      console.log(`\nUser ${userId.slice(0, 8)}: reformulating ${memories.length} memories`);

      const facts = await reformulateMemories(memories);
      let userKept = 0;

      for (const fact of facts) {
        if (typeof fact.content !== 'string' || fact.content.trim().length < 1) {
          results.rejectedByValidation++;
          continue;
        }
        const content = fact.content.trim();
        if (content.length > MAX_CONTENT_LEN) {
          results.rejectedByValidation++;
          continue;
        }
        if (typeof fact.confidence !== 'number' || fact.confidence < MIN_CONFIDENCE) {
          results.rejectedByValidation++;
          continue;
        }
        if (!Object.values(FactCategory).includes(fact.category)) {
          results.rejectedByValidation++;
          continue;
        }

        if (!dryRun) {
          const expiresAt = fact.category === FactCategory.TOP_OF_MIND
            ? new Date(Date.now() + TOP_OF_MIND_TTL_MS)
            : null;

          await prisma.userFact.create({
            data: {
              userId,
              category: fact.category,
              content,
              source: FactSource.MIGRATED,
              confidence: fact.confidence,
              expiresAt,
            },
          });
        }

        userKept++;
      }

      results.usersProcessed++;
      results.totalOut += userKept;
      results.discarded += memories.length - userKept;

      console.log(`  -> ${userKept} facts kept (discarded ${memories.length - userKept})`);
      facts.slice(0, 3).forEach(f => {
        const preview = (f.content || '').slice(0, 80);
        console.log(`     [${f.category}] (conf: ${f.confidence}) ${preview}`);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.errors.push(`${userId}: ${message}`);
      console.error(`  ERROR: ${message}`);
    }
  }

  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Users processed:        ${results.usersProcessed}`);
  console.log(`Legacy memories in:     ${results.totalIn}`);
  console.log(`UserFact rows out:      ${results.totalOut}`);
  console.log(`Discarded (transient):  ${results.discarded}` + (results.totalIn > 0
    ? ` (${((results.discarded / results.totalIn) * 100).toFixed(1)}%)`
    : ''));
  console.log(`Rejected by validation: ${results.rejectedByValidation}`);
  console.log(`Errors:                 ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.log('Error details:');
    results.errors.forEach(e => console.log(`  - ${e}`));
  }
}

async function reformulateMemories(memories: Array<{ category: string; value: string }>): Promise<ReformulatedFact[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const memoryList = memories
    .map((m, i) => `${i + 1}. [${m.category || 'unknown'}] ${m.value || ''}`)
    .join('\n');

  const userPrompt = `LEGACY MEMORIES:\n${memoryList}\n\nReformulate. Output strict JSON only.`;

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: HAIKU_MODEL,
      max_tokens: 2000,
      system: REFORMULATION_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 60000,
    },
  );

  const content = response.data?.content;
  if (!Array.isArray(content) || content.length === 0) return [];
  const block = content[0];
  const raw = typeof block?.text === 'string' ? block.text : '';

  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned) as ReformulationResult;
  if (!parsed || !Array.isArray(parsed.facts)) {
    throw new Error('Invalid reformulation response: missing facts array');
  }

  return parsed.facts;
}

const dryRun = process.argv.includes('--dry-run');
migrateAllUsers(dryRun)
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration failed:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
