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
const MIN_CONFIDENCE = 0.7;
const MAX_CONTENT_LEN = 500;
const CODE_PATTERN = /^(root@|sudo |journalctl|pm2 |\$ |\/[a-z]|\.sh\b|\.log\b|cd \/|ls -|systemctl|grep |find )/i;

const SYSTEM_PROMPT = `You are a memory extractor for a chat assistant. Your job is to read a conversation and identify PERSISTENT facts the USER stated about themselves — things that will still be true a month from now.

CRITICAL — facts must be SELF-DISCLOSED, not inferred from the topic the user is asking about.

ACCEPTABLE (first-person self-attribution):
- "I'm a marketing consultant"           → WORK: "Marketing consultant"
- "my team uses Postgres"                → WORK: "Team's stack includes Postgres"
- "I prefer brevity"                     → PERSONAL: "Prefers concise responses"
- "I live in Seattle"                    → PERSONAL: "Based in Seattle"

UNACCEPTABLE (user is researching or generating content about a topic, NOT telling you about themselves):
- "How does mastectomy reconstruction work?" → do NOT store "User has mastectomy"
- "Walk me through nginx OIDC config"        → do NOT store "User uses OIDC"
- "Write a blog post about tummy tucks"      → do NOT store "User performs tummy tucks"
- "What's arbitration waiver?"               → do NOT store "User is in arbitration"

If the conversation is dominated by research, lookup, how-to, or content-generation queries (i.e. the user is using the assistant to learn about or produce content for a topic rather than discussing their own situation), return ZERO facts: {"facts": [], "summary": "..."}.

CRITICAL — facts must be about the USER, not about third parties they mention.

UNACCEPTABLE (third-party content framed as user fact):
- "My client Sarah runs a clinic, write her copy"            → do NOT store "User runs a clinic"
- "My friend is allergic to penicillin, what should they do" → do NOT store "User is allergic to penicillin"
- "Help me draft a memo from my boss to the team"            → do NOT store boss's role as user fact

ACCEPTABLE (user self-discloses while mentioning a third party):
- "I'm a marketing consultant; my client Sarah runs a clinic" → WORK: "Marketing consultant" (Sarah's clinic is NOT a fact about user)

When in doubt about who a "we"/"my"/"our" refers to, return zero facts.

UNACCEPTABLE (writing content FROM a specific perspective doesn't make the user that perspective):
- "Write a provider administrative appeal to BCBS denying X" → do NOT store "User is a provider" or "User handles insurance appeals"
- "Draft a resignation email from a manager to HR"           → do NOT store "User is a manager"
- "Help me write a press release authored by CEO Sarah"      → do NOT store anything about Sarah OR the user

The user is writing content that ADOPTS a perspective. The adopted perspective is not the user's identity.

When ambiguous, return zero facts. The retrieval system handles empty results safely; bad facts pollute every future query the user runs.

OUTPUT FORMAT — return ONLY the JSON object. No markdown fences, no rationale paragraph, no explanation, no preamble. The JSON object must be the entire response. Any text outside the JSON will be rejected by the parser.

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
- WORK: only extract if the fact matches ONE of these shapes:
    (a) Role/title + employer: "I'm a [role] at [company]" → "Marketing consultant" or "Marketing consultant at AcmeCorp"
    (b) Stable tech stack / tools used by the user's team: "We use Postgres and Node" → "Stack: Postgres and Node"

  Do NOT extract:
  - Current clients or projects ("Writing for X", "Working with Dr. Y") — these change month to month
  - Active deliverables ("Creating a blog post about Z") — these are tasks, not facts
  - Industry or domain knowledge inferred from topic — see SELF-DISCLOSURE rules above

  If a fact about work doesn't match shape (a) or (b), return zero. WORK is the most over-extracted category — be strict.
- PERSONAL: location, language preference, communication style — only when SELF-disclosed
- TOP_OF_MIND: user's OWN explicit upcoming event or scheduled milestone (auto-expires in 14 days).
    NEVER for ongoing implementation, debugging, or general project work — see CRITICAL section below.
    ACCEPTABLE: "I'm preparing for a board meeting next week" → "Preparing for upcoming board meeting"
    UNACCEPTABLE: "How do board meetings usually run?" → do NOT store anything
    UNACCEPTABLE: "I'm planning to implement OIDC across our sites" → do NOT store anything (this is ongoing work, not a scheduled event)
- HISTORY: user's OWN past projects, previous companies, completed work

CRITICAL — first-person framing about active or in-progress work is NOT a persistent fact.

TOP_OF_MIND is reserved for explicit upcoming events or scheduled milestones the user mentions in passing. It is NOT for ongoing implementation work, debugging sessions, or "what I'm working on right now."

UNACCEPTABLE (first-person but transient activity):
- "I'm trying to set up X"               → do NOT store
- "I'm planning to implement Y"          → do NOT store
- "I have been planning to implement Y across our sites" → do NOT store (multi-site scope doesn't make it stable)
- "I've been working on Z this week"     → do NOT store
- "We're debugging an issue with W"      → do NOT store
- "I'm building a feature for V"         → do NOT store

ACCEPTABLE (stable identity / role / tool / preference / scheduled milestone):
- "I'm a backend engineer at AcmeCorp"             → WORK: "Backend engineer at AcmeCorp"
- "Our stack is TypeScript and Postgres"           → WORK: "Stack: TypeScript and Postgres"
- "I always prefer brevity"                        → PERSONAL: "Prefers concise responses"
- "I'm based in Seattle"                           → PERSONAL: "Based in Seattle"
- "I'm preparing for my Series A pitch next month" → TOP_OF_MIND: "Preparing for Series A pitch (next month)"
- "I have a wedding in June"                       → TOP_OF_MIND: "Wedding in June"

SELF-CHECK: if your summary describes the user with any present-participle verb form ("-ing" verbs: planning, trying, working, implementing, building, creating, drafting, debugging, setting up, etc.) followed by a project, task, or deliverable — return zero facts. Present-participle verbs describe activity, not identity. The ONLY exceptions are stable role statements like "working AS a marketing consultant" (role) or "based IN Seattle" (location). If the -ing verb describes what the user IS DOING rather than what they ARE, return zero facts.

Test for TOP_OF_MIND: is there a specific upcoming event or deadline (board meeting, pitch, launch date, trip, ceremony)? If yes, eligible. If it's general "I'm working on..." chatter, NO.

Confidence guide:
- 0.9+: User stated directly in first-person with explicit verb of being or doing ("I am a writer", "I work at X", "I prefer Y")
- 0.7-0.9: User self-attributed across multiple turns with consistent first-person framing
- <0.7: Don't include — ambiguous "we"/"my" references frequently belong to research framing, not self-disclosure

If no facts qualify, return: {"facts": [], "summary": "Brief description of the conversation topic"}`;

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
    // Strip leading ```json or ``` fence if present
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '');

    // Find the first balanced JSON object; ignore any trailing prose
    // (rationale paragraphs, closing fences, etc.) so the parser doesn't
    // break when the model adds commentary outside the JSON. Tracks string
    // state so braces inside string literals don't throw off the depth count.
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;
    for (let i = firstBrace; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }
    if (endIdx === -1) return null;

    const parsed = JSON.parse(cleaned.slice(firstBrace, endIdx + 1));
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.facts)) return null;
    if (typeof parsed.summary !== 'string') return null;

    return parsed as ExtractionResult;
  } catch {
    return null;
  }
}
