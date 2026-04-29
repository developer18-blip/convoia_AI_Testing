/**
 * UserFact Retrieval Service — Phase 6 memory cutover.
 *
 * Replaces vector-chunk retrieval for users opted into useUserFacts.
 * Selects active, non-expired facts in categories relevant to the
 * detected intent. Tracks lastUsedAt asynchronously so frequently-used
 * facts surface first on subsequent queries.
 *
 * The old vector path remains the fallback in aiController if this
 * returns empty or throws — guarantees no user gets a degraded memory
 * experience even if Phase 6 has bugs.
 */

import { FactCategory } from '@prisma/client';
import type { UserFact } from '@prisma/client';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import type { TaskIntent } from './intentClassifier.js';

interface MemoryStrategy {
  categories: FactCategory[];
  maxFacts: number;
}

function memoryStrategyFromIntent(intent: TaskIntent): MemoryStrategy {
  switch (intent) {
    case 'coding':
    case 'instruction':
      return { categories: [FactCategory.WORK, FactCategory.TOP_OF_MIND], maxFacts: 8 };

    case 'analysis':
    case 'research':
      return {
        categories: [FactCategory.WORK, FactCategory.TOP_OF_MIND, FactCategory.HISTORY],
        maxFacts: 10,
      };

    case 'long_form_writing':
    case 'creative_writing':
    case 'editing':
      return { categories: [FactCategory.PERSONAL, FactCategory.WORK], maxFacts: 6 };

    case 'extraction':
      return { categories: [FactCategory.WORK], maxFacts: 4 };

    case 'math':
      return { categories: [FactCategory.WORK], maxFacts: 3 };

    case 'translation':
      return { categories: [FactCategory.PERSONAL], maxFacts: 3 };

    case 'question':
      return {
        categories: [FactCategory.WORK, FactCategory.PERSONAL, FactCategory.TOP_OF_MIND],
        maxFacts: 8,
      };

    case 'conversation':
      return {
        categories: [FactCategory.PERSONAL, FactCategory.TOP_OF_MIND, FactCategory.WORK],
        maxFacts: 5,
      };

    default:
      return {
        categories: [FactCategory.WORK, FactCategory.PERSONAL, FactCategory.TOP_OF_MIND],
        maxFacts: 8,
      };
  }
}

export interface RetrievedFacts {
  facts: UserFact[];
  formattedPrompt: string;
}

export async function retrieveFactsForQuery(
  userId: string,
  intent: TaskIntent,
): Promise<RetrievedFacts> {
  const strategy = memoryStrategyFromIntent(intent);

  // Overshoot 2x so supersession filtering still leaves enough candidates.
  const candidates = await prisma.userFact.findMany({
    where: {
      userId,
      active: true,
      category: { in: strategy.categories },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: [
      { confidence: 'desc' },
      { lastUsedAt: 'desc' },
    ],
    take: strategy.maxFacts * 2,
  });

  // Drop facts pointed to by another candidate's supersededBy — keeps
  // only the newest version when both old and new sit in the result set.
  const supersededIds = new Set(
    candidates
      .map(f => f.supersededBy)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const filtered = candidates.filter(f => !supersededIds.has(f.id));
  const selected = filtered.slice(0, strategy.maxFacts);

  if (selected.length > 0) {
    prisma.userFact
      .updateMany({
        where: { id: { in: selected.map(f => f.id) } },
        data: { lastUsedAt: new Date() },
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.warn(`UserFact lastUsedAt update failed: ${message}`);
      });
  }

  return {
    facts: selected,
    formattedPrompt: formatFactsForPrompt(selected),
  };
}

function formatFactsForPrompt(facts: UserFact[]): string {
  if (facts.length === 0) return '';

  const byCategory: Record<FactCategory, UserFact[]> = {
    [FactCategory.WORK]: [],
    [FactCategory.PERSONAL]: [],
    [FactCategory.TOP_OF_MIND]: [],
    [FactCategory.HISTORY]: [],
  };

  for (const f of facts) {
    byCategory[f.category].push(f);
  }

  const sections: string[] = [];

  if (byCategory[FactCategory.WORK].length > 0) {
    sections.push(
      `**Work:** ${byCategory[FactCategory.WORK].map(f => f.content).join('. ')}.`,
    );
  }
  if (byCategory[FactCategory.PERSONAL].length > 0) {
    sections.push(
      `**Personal:** ${byCategory[FactCategory.PERSONAL].map(f => f.content).join('. ')}.`,
    );
  }
  if (byCategory[FactCategory.TOP_OF_MIND].length > 0) {
    sections.push(
      `**Currently focused on:** ${byCategory[FactCategory.TOP_OF_MIND].map(f => f.content).join('. ')}.`,
    );
  }
  if (byCategory[FactCategory.HISTORY].length > 0) {
    sections.push(
      `**Background:** ${byCategory[FactCategory.HISTORY].map(f => f.content).join('. ')}.`,
    );
  }

  return `\n\n## About this user\n\n${sections.join('\n\n')}`;
}
