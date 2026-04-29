import cron from 'node-cron';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { extractFactsFromConversation } from '../services/factExtractionService.js';

interface EligibleConversation {
  id: string;
  userId: string;
}

export function startFactExtractionJob(): void {
  cron.schedule('0 * * * *', () => {
    runExtractionPass().catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Fact extraction cron handler crashed: ${message}`);
    });
  });
  logger.info('Fact extraction cron registered (hourly at :00)');
}

async function runExtractionPass(): Promise<void> {
  if (process.env.MEMORY_EXTRACTION_ENABLED !== 'true') {
    logger.info('Fact extraction skipped: MEMORY_EXTRACTION_ENABLED env flag is not "true"');
    return;
  }

  const startTime = Date.now();

  try {
    const eligible = await prisma.$queryRawUnsafe<EligibleConversation[]>(`
      SELECT c.id, c."userId"
      FROM "Conversation" c
      LEFT JOIN "UserConversationSummary" ucs ON ucs."conversationId" = c.id
      WHERE ucs.id IS NULL
        AND c."updatedAt" < NOW() - INTERVAL '30 minutes'
        AND (
          SELECT COUNT(*) FROM "ChatMessage" m
          WHERE m."conversationId" = c.id AND m.role = 'user'
        ) >= 2
      ORDER BY c."updatedAt" DESC
      LIMIT 100
    `);

    logger.info(`Fact extraction pass: ${eligible.length} conversations eligible`);

    let processed = 0;
    let factsAdded = 0;
    let errors = 0;

    for (const conv of eligible) {
      try {
        const result = await extractFactsFromConversation(conv.userId, conv.id);
        processed++;
        factsAdded += result.factsAdded;
      } catch (err: unknown) {
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Fact extraction failed for conversation ${conv.id}: ${message}`);
      }
    }

    logger.info(
      `Fact extraction pass done: ${processed} processed, ${factsAdded} facts added, ${errors} errors, ${Date.now() - startTime}ms`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Fact extraction pass crashed: ${message}`);
  }
}
