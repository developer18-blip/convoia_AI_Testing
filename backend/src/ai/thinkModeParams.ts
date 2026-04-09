/**
 * Think Mode Parameter Builder
 *
 * Classifies every active model into one of four Think Mode tiers
 * and returns the exact API parameters needed for each.
 *
 * Tier A — Native Extended Thinking (Anthropic budget_tokens, Gemini thinkingConfig)
 * Tier B — OpenAI O-Series Reasoning (reasoning_effort, no temperature)
 * Tier C — Strong Standard Models (prompt-only Think Mode)
 * Tier D — Lite/Fast Models (Think Mode works, lower ceiling)
 */

export type ThinkModeTier = 'A' | 'B' | 'C' | 'D';

export interface ThinkModeParams {
  tier: ThinkModeTier;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  thinkingConfig?: {
    thinkingBudget: number;
  };
  isNativeReasoner?: boolean;
  supportsSystemPrompt?: boolean;
}

const THINK_MODE_CONFIG: Record<string, ThinkModeParams> = {

  // ── TIER A: ANTHROPIC EXTENDED THINKING ──────────────────────────
  // temperature MUST be 1 when thinking is enabled (Anthropic requirement)
  // max_tokens MUST be > budget_tokens

  'claude-opus-4-6': {
    tier: 'A',
    temperature: 1,
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: 10000 },
    supportsSystemPrompt: true,
  },
  'claude-opus-4-5': {
    tier: 'A',
    temperature: 1,
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: 10000 },
    supportsSystemPrompt: true,
  },
  'claude-sonnet-4-6': {
    tier: 'A',
    temperature: 1,
    max_tokens: 12000,
    thinking: { type: 'enabled', budget_tokens: 8000 },
    supportsSystemPrompt: true,
  },
  'claude-sonnet-4-5': {
    tier: 'A',
    temperature: 1,
    max_tokens: 12000,
    thinking: { type: 'enabled', budget_tokens: 8000 },
    supportsSystemPrompt: true,
  },

  // ── TIER A: GEMINI THINKING ─────────────────────────────────────

  'gemini-2.5-flash-lite': {
    tier: 'A',
    temperature: 0.4,
    max_tokens: 4000,
    thinkingConfig: { thinkingBudget: 3000 },
    supportsSystemPrompt: true,
  },
  'gemini-2.5-flash': {
    tier: 'A',
    temperature: 0.4,
    max_tokens: 6000,
    thinkingConfig: { thinkingBudget: 6000 },
    supportsSystemPrompt: true,
  },
  'gemini-3.1-pro': {
    tier: 'A',
    temperature: 0.4,
    max_tokens: 8000,
    thinkingConfig: { thinkingBudget: 8000 },
    supportsSystemPrompt: true,
  },
  'gemini-2.5-pro': {
    tier: 'A',
    temperature: 0.4,
    max_tokens: 8000,
    thinkingConfig: { thinkingBudget: 8000 },
    supportsSystemPrompt: true,
  },

  // ── TIER B: OPENAI O-SERIES REASONING ───────────────────────────
  // CRITICAL: o-series does NOT accept temperature
  // o-series treats system prompt as a "developer message"
  // Uses max_completion_tokens, NOT max_tokens

  'o4-mini': {
    tier: 'B',
    reasoning_effort: 'high',
    max_completion_tokens: 8000,
    supportsSystemPrompt: true,
  },
  'o3-mini': {
    tier: 'B',
    reasoning_effort: 'high',
    max_completion_tokens: 8000,
    supportsSystemPrompt: true,
  },
  'o3': {
    tier: 'B',
    reasoning_effort: 'high',
    max_completion_tokens: 16000,
    supportsSystemPrompt: true,
  },

  // ── TIER C: DEEPSEEK REASONER (native <think> tags) ─────────────

  'deepseek-reasoner': {
    tier: 'C',
    temperature: 0.6,
    max_tokens: 8000,
    isNativeReasoner: true,
    supportsSystemPrompt: true,
  },

  // ── TIER C: STRONG STANDARD MODELS ──────────────────────────────

  'deepseek-chat': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'gpt-5.4': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'gpt-5': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'gpt-4.1': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'gpt-4o': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'gemini-2.0-flash': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },

  // ── TIER C: PERPLEXITY ──────────────────────────────────────────
  'sonar-reasoning-pro': {
    tier: 'C', temperature: 0.4, max_tokens: 8000,
    supportsSystemPrompt: true,
  },
  'sonar-reasoning': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'sonar-pro': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'sonar': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },

  // ── TIER C: XAI (GROK) ─────────────────────────────────────────
  'grok-3': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },
  'grok-3-mini': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },
  'grok-2': {
    tier: 'C', temperature: 0.4, max_tokens: 4000,
    supportsSystemPrompt: true,
  },

  // ── TIER D: LITE / FAST MODELS ──────────────────────────────────

  'gpt-5.4-nano': {
    tier: 'D', temperature: 0.5, max_tokens: 2000,
    supportsSystemPrompt: true,
  },
  'gpt-5.4-mini': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },
  'gpt-5-mini': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },
  'gpt-4.1-nano': {
    tier: 'D', temperature: 0.5, max_tokens: 2000,
    supportsSystemPrompt: true,
  },
  'gpt-4.1-mini': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },
  'gpt-4o-mini': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },
  'claude-haiku': {
    tier: 'D', temperature: 0.5, max_tokens: 3000,
    supportsSystemPrompt: true,
  },
};

/** Safe default for any model not in the config map. */
const DEFAULT_PARAMS: ThinkModeParams = {
  tier: 'C',
  temperature: 0.4,
  max_tokens: 4000,
  supportsSystemPrompt: true,
};

/**
 * Build Think Mode parameters for a given modelId.
 * Uses longest-first fuzzy matching so "gpt-5.4-mini" matches
 * before "gpt-5.4", and "gemini-2.5-flash-lite" before "gemini-2.5-flash".
 */
export function buildThinkModeParams(modelId: string): ThinkModeParams {
  const modelIdLower = modelId.toLowerCase();
  const matchedKey = Object.keys(THINK_MODE_CONFIG)
    .sort((a, b) => b.length - a.length)
    .find(k => modelIdLower.includes(k));

  return matchedKey ? { ...THINK_MODE_CONFIG[matchedKey] } : { ...DEFAULT_PARAMS };
}

/**
 * Parse DeepSeek Reasoner responses that contain <think>...</think> blocks.
 * Returns the thinking content and the final answer separately.
 */
export function parseDeepSeekReasonerResponse(raw: string): {
  thinking: string;
  answer: string;
} {
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  const thinking = thinkMatch ? thinkMatch[1].trim() : '';
  const answer = raw.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  return { thinking, answer };
}
