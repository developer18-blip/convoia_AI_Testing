/**
 * Model Capability Profiles — used by the LLM Router to select
 * the best model for each query.
 *
 * Each model has:
 *   costTier    1 (cheapest) → 5 (most expensive)
 *   qualityTier 1 (basic)    → 5 (frontier)
 *   speedTier   1 (slow)     → 5 (fastest)
 *
 * Cost tiers (approximate $/1M output tokens):
 *   1 = <$1     (Nano, Haiku, Flash, DeepSeek Chat)
 *   2 = $1–$5   (Mini, o4-mini, Grok non-reasoning)
 *   3 = $5–$15  (Sonnet, GPT-5.4, Gemini Pro, Sonar Pro)
 *   4 = $15–$30 (Opus, o3, Grok reasoning)
 *   5 = $30+    (reserved for future models)
 */

import logger from '../config/logger.js';

export interface ModelProfile {
  /** DB modelId string (e.g. "claude-sonnet-4-6") */
  modelId: string;
  /** UUID from AIModel table — populated at runtime by hydrateModelProfiles() */
  dbId?: string;
  provider: string;
  displayName: string;
  costTier: 1 | 2 | 3 | 4 | 5;
  qualityTier: 1 | 2 | 3 | 4 | 5;
  speedTier: 1 | 2 | 3 | 4 | 5;
  contextWindow: number;
  supportsVision: boolean;
  supportsThinking: boolean;
  /** Task intents this model excels at */
  strengths: string[];
  /** Task intents to avoid sending here */
  weaknesses: string[];
  /** Human-readable primary use cases */
  bestFor: string[];
}

export const MODEL_PROFILES: ModelProfile[] = [

  // ── TIER 1 — NANO / ULTRA-FAST ──────────────────────────────────────────
  {
    modelId: 'gpt-5.4-nano', provider: 'openai', displayName: 'GPT-5.4 Nano',
    costTier: 1, qualityTier: 1, speedTier: 5, contextWindow: 128000,
    supportsVision: false, supportsThinking: false,
    strengths: ['conversation', 'translation', 'extraction'],
    weaknesses: ['coding', 'analysis', 'research', 'long_form_writing', 'math'],
    bestFor: ['Simple questions', 'Quick translations', 'Casual chat'],
  },
  {
    modelId: 'gpt-4.1-nano', provider: 'openai', displayName: 'GPT-4.1 Nano',
    costTier: 1, qualityTier: 1, speedTier: 5, contextWindow: 128000,
    supportsVision: false, supportsThinking: false,
    strengths: ['conversation', 'translation', 'extraction'],
    weaknesses: ['coding', 'analysis', 'research', 'long_form_writing'],
    bestFor: ['Simple tasks', 'Fast responses'],
  },

  // ── TIER 2 — FAST / BUDGET ───────────────────────────────────────────────
  {
    modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic', displayName: 'Claude Haiku 4.5',
    costTier: 2, qualityTier: 2, speedTier: 5, contextWindow: 200000,
    supportsVision: true, supportsThinking: false,
    strengths: ['conversation', 'question', 'extraction', 'editing', 'translation'],
    weaknesses: ['research', 'math'],
    bestFor: ['Quick answers', 'Summarization', 'Light editing'],
  },
  {
    modelId: 'gpt-5.4-mini', provider: 'openai', displayName: 'GPT-5.4 Mini',
    costTier: 2, qualityTier: 2, speedTier: 4, contextWindow: 128000,
    supportsVision: true, supportsThinking: false,
    strengths: ['conversation', 'question', 'coding', 'instruction'],
    weaknesses: ['research', 'long_form_writing'],
    bestFor: ['Standard questions', 'Basic coding', 'Instructions'],
  },
  {
    modelId: 'gemini-2.5-flash', provider: 'google', displayName: 'Gemini 2.5 Flash',
    costTier: 1, qualityTier: 2, speedTier: 5, contextWindow: 1000000,
    supportsVision: true, supportsThinking: true,
    strengths: ['question', 'extraction', 'conversation', 'instruction'],
    weaknesses: ['creative_writing', 'long_form_writing'],
    bestFor: ['Fast answers', 'Huge document analysis', 'Quick lookups'],
  },
  {
    modelId: 'deepseek-chat', provider: 'deepseek', displayName: 'DeepSeek Chat',
    costTier: 1, qualityTier: 2, speedTier: 4, contextWindow: 128000,
    supportsVision: false, supportsThinking: false,
    strengths: ['coding', 'question', 'math', 'instruction'],
    weaknesses: ['creative_writing', 'long_form_writing'],
    bestFor: ['Budget coding', 'Technical questions'],
  },
  {
    modelId: 'codestral-latest', provider: 'mistral', displayName: 'Codestral',
    costTier: 1, qualityTier: 3, speedTier: 4, contextWindow: 256000,
    supportsVision: false, supportsThinking: false,
    strengths: ['coding'],
    weaknesses: ['conversation', 'creative_writing', 'long_form_writing', 'research'],
    bestFor: ['Code generation', 'Code review', 'Debugging'],
  },
  {
    modelId: 'o4-mini', provider: 'openai', displayName: 'o4 Mini',
    costTier: 2, qualityTier: 3, speedTier: 3, contextWindow: 200000,
    supportsVision: true, supportsThinking: true,
    strengths: ['math', 'coding', 'analysis', 'instruction'],
    weaknesses: ['creative_writing', 'conversation'],
    bestFor: ['Reasoning tasks', 'Math', 'Logic problems'],
  },

  // ── TIER 3 — STANDARD / WORKHORSE ───────────────────────────────────────
  {
    modelId: 'claude-sonnet-4-6', provider: 'anthropic', displayName: 'Claude Sonnet 4.6',
    costTier: 3, qualityTier: 4, speedTier: 3, contextWindow: 1000000,
    supportsVision: true, supportsThinking: true,
    strengths: ['long_form_writing', 'creative_writing', 'analysis', 'coding', 'editing', 'research'],
    weaknesses: [],
    bestFor: ['Writing', 'Analysis', 'Coding', 'General excellence'],
  },
  {
    modelId: 'gpt-5.4', provider: 'openai', displayName: 'GPT-5.4',
    costTier: 3, qualityTier: 4, speedTier: 3, contextWindow: 1050000,
    supportsVision: true, supportsThinking: true,
    strengths: ['coding', 'analysis', 'instruction', 'question', 'long_form_writing'],
    weaknesses: [],
    bestFor: ['Coding', 'General tasks', 'Computer use'],
  },
  {
    modelId: 'gemini-3.1-pro', provider: 'google', displayName: 'Gemini 3.1 Pro',
    costTier: 3, qualityTier: 4, speedTier: 3, contextWindow: 1000000,
    supportsVision: true, supportsThinking: true,
    strengths: ['research', 'analysis', 'coding', 'math', 'question'],
    weaknesses: ['creative_writing'],
    bestFor: ['Research', 'Long documents', 'Science & math'],
  },
  {
    modelId: 'grok-4.20-0309-non-reasoning', provider: 'xai', displayName: 'Grok 4.20',
    costTier: 2, qualityTier: 3, speedTier: 4, contextWindow: 131072,
    supportsVision: true, supportsThinking: false,
    strengths: ['question', 'analysis', 'conversation', 'coding'],
    weaknesses: ['long_form_writing'],
    bestFor: ['Direct analysis', 'Current events', 'Fast answers'],
  },
  {
    modelId: 'deepseek-reasoner', provider: 'deepseek', displayName: 'DeepSeek Reasoner',
    costTier: 1, qualityTier: 3, speedTier: 2, contextWindow: 128000,
    supportsVision: false, supportsThinking: true,
    strengths: ['math', 'coding', 'analysis'],
    weaknesses: ['conversation', 'creative_writing', 'long_form_writing'],
    bestFor: ['Step-by-step reasoning', 'Math proofs', 'Logic'],
  },

  // ── TIER 4 — FLAGSHIP / PREMIUM ─────────────────────────────────────────
  {
    modelId: 'claude-opus-4-6', provider: 'anthropic', displayName: 'Claude Opus 4.6',
    costTier: 4, qualityTier: 5, speedTier: 2, contextWindow: 1000000,
    supportsVision: true, supportsThinking: true,
    strengths: ['research', 'analysis', 'coding', 'long_form_writing', 'creative_writing', 'math'],
    weaknesses: [],
    bestFor: ['Expert-level analysis', 'Complex coding', 'Deep research'],
  },
  {
    modelId: 'o3', provider: 'openai', displayName: 'o3',
    costTier: 4, qualityTier: 5, speedTier: 1, contextWindow: 200000,
    supportsVision: true, supportsThinking: true,
    strengths: ['math', 'coding', 'analysis', 'research'],
    weaknesses: ['conversation', 'creative_writing'],
    bestFor: ['Hard math', 'Complex reasoning', 'Expert coding'],
  },
  {
    modelId: 'grok-4.20-0309-reasoning', provider: 'xai', displayName: 'Grok 4.20 Reasoning',
    costTier: 2, qualityTier: 4, speedTier: 2, contextWindow: 131072,
    supportsVision: true, supportsThinking: true,
    strengths: ['analysis', 'coding', 'math', 'research'],
    weaknesses: ['creative_writing'],
    bestFor: ['Reasoning tasks', 'Analysis at low cost'],
  },

  // ── SEARCH / PERPLEXITY ──────────────────────────────────────────────────
  {
    modelId: 'sonar-pro', provider: 'perplexity', displayName: 'Sonar Pro',
    costTier: 3, qualityTier: 3, speedTier: 3, contextWindow: 200000,
    supportsVision: false, supportsThinking: false,
    strengths: ['research', 'question'],
    weaknesses: ['coding', 'creative_writing', 'long_form_writing', 'math'],
    bestFor: ['Web-grounded answers', 'Current events'],
  },
  {
    modelId: 'sonar-deep-research', provider: 'perplexity', displayName: 'Sonar Deep Research',
    costTier: 3, qualityTier: 4, speedTier: 1, contextWindow: 128000,
    supportsVision: false, supportsThinking: true,
    strengths: ['research'],
    weaknesses: ['coding', 'creative_writing', 'conversation', 'math'],
    bestFor: ['Deep multi-source research'],
  },
];

/**
 * Populate dbId on each profile by matching modelId strings against the DB.
 * Call once on server startup after validateModels() runs (so only active
 * models are mapped). Idempotent — safe to call multiple times.
 */
export async function hydrateModelProfiles(prisma: any): Promise<void> {
  try {
    const dbModels = await prisma.aIModel.findMany({
      where: { isActive: true },
      select: { id: true, modelId: true },
    });

    const dbMap = new Map<string, string>(dbModels.map((m: any) => [m.modelId, m.id]));

    let mapped = 0;
    for (const profile of MODEL_PROFILES) {
      const dbId = dbMap.get(profile.modelId);
      if (dbId) {
        profile.dbId = dbId;
        mapped++;
      } else {
        // Clear stale dbId if model was deactivated since last boot
        profile.dbId = undefined;
      }
    }

    logger.info(`LLM Router: ${mapped}/${MODEL_PROFILES.length} profiles mapped to active DB models`);
  } catch (err: any) {
    logger.error(`LLM Router hydration failed (non-fatal): ${err.message}`);
  }
}
