import axios from 'axios';
import { FactCategory, FactSource } from '@prisma/client';
import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { config } from '../config/env.js';

interface ExtractedFact {
  category: FactCategory;
  content: string;
  confidence: number;
  supersedes_existing?: string;
}

interface ExtractionResult {
  facts: ExtractedFact[];
  summary: string;
}

export interface ExtractionOutcome {
  factsAdded: number;
  superseded: number;
  summary: string;
}

const TOP_OF_MIND_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MIN_CONFIDENCE = 0.5;
const MAX_CONTENT_LEN = 500;
const CODE_PATTERN = /^(root@|sudo |journalctl|pm2 |\$ |\/[a-z]|\.sh\b|\.log\b|cd \/|ls -|systemctl|grep |find )/i;

const SYSTEM_PROMPT = `You are a memory extractor for a chat assistant. Your job is to read a conversation and identify PERSISTENT facts about the user — things that will still be true a month from now.

CRITICAL DISTINCTION:
- PERSISTENT FACT: "User builds AI platforms" / "User prefers TypeScript" / "User is based in Seattle"
- TRANSIENT TASK: "User wants a blog post about tummy tucks" / "User is debugging an OOM error" / "User asked about TCP"

Transient tasks must NOT be extracted as facts. They are temporary requests, not enduring properties of the user.

Output strict JSON:
{
  "facts": [
    {
      "category": "WORK" | "PERSONAL" | "TOP_OF_MIND" | "HISTORY",
      "content": "Clean natural-language fact",
      "confidence": 0.0-1.0,
      "supersedes_existing": "fact id from input, if this replaces one"
    }
  ],
  "summary": "2-3 sentence summary of what was discussed"
}

Categories:
- WORK: role, projects, tech stack, collaborators, tools, business context
- PERSONAL: location, language preference, communication style
- TOP_OF_MIND: current focus, active project (auto-expires in 14 days)
- HISTORY: past projects, previous companies, completed work

Confidence guide:
- 0.9+: User stated directly
- 0.7-0.9: Strongly implied by repeated context
- 0.5-0.7: Inferred from one mention
- <0.5: Don't include — too speculative

If no facts can be extracted, return: {"facts": [], "summary": "Brief description"}`;

export async function extractFactsFromConversation(
  userId: string,
  conversationId: string,
): Promise<ExtractionOutcome> {
  // Lock via UserConversationSummary unique constraint on conversationId
  let lockAcquired = false;
  try {
    await prisma.userConversationSummary.create({
      data: {
        userId,
        conversationId,
        summary: '[processing]',
        factIds: [],
        messageCount: 0,
      },
    });
    lockAcquired = true;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      logger.info(`Fact extraction: conversation ${conversationId} already processed/locked, skipping`);
      return { factsAdded: 0, superseded: 0, summary: 'already processed' };
    }
    throw err;
  }

  try {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (messages.length < 2) {
      await prisma.userConversationSummary.update({
        where: { conversationId },
        data: { summary: 'too short for extraction', messageCount: messages.length },
      });
      return { factsAdded: 0, superseded: 0, summary: 'too short' };
    }

    const existingFacts = await prisma.userFact.findMany({
      where: { userId, active: true },
      select: { id: true, category: true, content: true },
      take: 50,
    });

    const existingContext = existingFacts.length > 0
      ? `EXISTING FACTS for this user:\n${existingFacts.map(f => `[${f.id}] [${f.category}] ${f.content}`).join('\n')}\n\n`
      : 'No existing facts.\n\n';

    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n\n');

    const userPrompt = `${existingContext}CONVERSATION TO ANALYZE:\n${conversationText}\n\nExtract facts. Output strict JSON only.`;

    const haikuResponse = await callHaikuForExtraction(SYSTEM_PROMPT, userPrompt);
    const parsed = parseExtractionResponse(haikuResponse);

    if (!parsed) {
      logger.warn(`Fact extraction: ${conversationId} invalid JSON response from Haiku`);
      await prisma.userConversationSummary.update({
        where: { conversationId },
        data: { summary: 'extraction parse failed', messageCount: messages.length },
      });
      return { factsAdded: 0, superseded: 0, summary: 'parse failed' };
    }

    let factsAdded = 0;
    let superseded = 0;
    const factIds: string[] = [];

    for (const f of parsed.facts) {
      if (!f || typeof f.content !== 'string') continue;
      const content = f.content.trim();
      if (content.length < 1 || content.length > MAX_CONTENT_LEN) continue;
      if (typeof f.confidence !== 'number' || f.confidence < MIN_CONFIDENCE) continue;
      if (!Object.values(FactCategory).includes(f.category)) continue;
      if (CODE_PATTERN.test(content)) continue;

      const expiresAt = f.category === FactCategory.TOP_OF_MIND
        ? new Date(Date.now() + TOP_OF_MIND_TTL_MS)
        : null;

      const created = await prisma.userFact.create({
        data: {
          userId,
          category: f.category,
          content,
          source: FactSource.EXTRACTED,
          confidence: f.confidence,
          sourceConvoId: conversationId,
          expiresAt,
        },
      });

      factIds.push(created.id);
      factsAdded++;

      if (f.supersedes_existing) {
        try {
          await prisma.userFact.update({
            where: { id: f.supersedes_existing },
            data: { active: false, supersededBy: created.id },
          });
          superseded++;
        } catch {
          logger.warn(`Fact extraction: failed to mark fact ${f.supersedes_existing} as superseded`);
        }
      }
    }

    await prisma.userConversationSummary.update({
      where: { conversationId },
      data: {
        summary: parsed.summary,
        factIds,
        messageCount: messages.length,
      },
    });

    logger.info(`Fact extraction ${conversationId}: ${factsAdded} added, ${superseded} superseded`);
    return { factsAdded, superseded, summary: parsed.summary };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Fact extraction failed for ${conversationId}: ${message}`);
    if (lockAcquired) {
      // Mark as processed-with-error so the cron doesn't keep retrying forever
      await prisma.userConversationSummary.update({
        where: { conversationId },
        data: { summary: `error: ${message.slice(0, 200)}` },
      }).catch(() => { /* swallow */ });
    }
    throw err;
  }
}

async function callHaikuForExtraction(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = config.apiKeys.anthropic;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 30000,
    },
  );

  const content = response.data?.content;
  if (!Array.isArray(content) || content.length === 0) return '';
  const block = content[0];
  return typeof block?.text === 'string' ? block.text : '';
}

function parseExtractionResponse(raw: string): ExtractionResult | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.facts)) return null;
    if (typeof parsed.summary !== 'string') return null;

    return parsed as ExtractionResult;
  } catch {
    return null;
  }
}
