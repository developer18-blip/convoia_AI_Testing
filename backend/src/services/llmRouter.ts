/**
 * LLM Router — Automatic Model Selection
 *
 * Picks the best model for each query based on:
 *   1. Intent (what the user is trying to do)
 *   2. Complexity (how hard the task is)
 *   3. Cost optimisation (cheapest model that meets quality requirements)
 *   4. User constraints (vision, thinking, token budget, context size)
 *   5. Provider availability (only considers models with a DB ID / active key)
 *
 * Design principles
 *   – NEVER pick an expensive model for a simple task
 *   – NEVER pick a weak model for a complex task
 *   – Prefer speed for simple tasks, quality for complex ones
 *   – When two models tie on quality, pick the cheaper one
 *   – When user balance is low, bias toward cheaper models
 *   – Respect model strengths — don't send creative writing to a math model
 */

import { MODEL_PROFILES, type ModelProfile } from '../ai/modelProfiles.js';
import type { TaskIntent, ClassifiedIntent } from './intentClassifier.js';
import logger from '../config/logger.js';

export interface RouterInput {
  intent: ClassifiedIntent;
  complexity: 'simple' | 'standard' | 'complex';
  hasVisionContent: boolean;
  thinkingEnabled: boolean;
  tokenBalance: number;
  estimatedInputTokens: number;
  preferredProvider?: string;
  /** Model DB IDs to skip (e.g., recently failed) */
  excludeModelIds?: string[];
  /** DB ID of the model used earlier in this conversation (continuity bonus) */
  conversationModelId?: string;
}

export interface RouterResult {
  selectedModel: ModelProfile;
  /** Human-readable explanation shown in the UI */
  reason: string;
  /** 0–1 confidence score */
  confidence: number;
  /** Runner-up models (for UI alternatives display) */
  alternatives: ModelProfile[];
  /** e.g. "~40% cheaper than Claude Opus 4.6" */
  costSavings?: string;
}

// ── Quality floor by complexity ──────────────────────────────────────────────
// Maps each complexity tier to the minimum qualityTier a model must have.
const QUALITY_FLOORS: Record<string, number> = {
  simple: 1,
  standard: 2,
  complex: 3,
};

// ── Intent-driven quality bonus ──────────────────────────────────────────────
// Some intents always benefit from a stronger model regardless of complexity.
const INTENT_QUALITY_BONUS: Partial<Record<TaskIntent, number>> = {
  research: 1,
  long_form_writing: 1,
  creative_writing: 1,
  math: 1,
};

// ── Cost cap by wallet balance ───────────────────────────────────────────────
function getMaxCostTier(tokenBalance: number): number {
  if (tokenBalance < 5_000) return 2;     // nearly empty — budget only
  if (tokenBalance < 50_000) return 3;    // low — standard max
  if (tokenBalance < 500_000) return 4;   // normal — allow premium
  return 5;                               // healthy — anything goes
}

// ── Scoring weights ──────────────────────────────────────────────────────────
const W = {
  STRENGTH_MATCH: 30,
  WEAKNESS_PENALTY: -40,
  QUALITY_EXACT: 20,
  QUALITY_PLUS_ONE: 15,
  QUALITY_OVERKILL: 5,
  COST_PER_TIER: 8,        // tier-1 gets +32, tier-5 gets 0
  SPEED_SIMPLE: 5,
  PROVIDER_PREF: 10,
  CONVERSATION_CONTINUITY: 8,
  THINKING_NATIVE: 15,
  CONVERSATION_NANO: 25,   // heavily bias cheap models for small talk
  CODING_SPECIALIST: 10,
  RESEARCH_PERPLEXITY: 15,
  MATH_REASONING: 15,
  MATH_SPECIALIST: 10,
  WRITING_ANTHROPIC: 10,
} as const;

/**
 * Score a single candidate against the routing inputs.
 * Higher = better fit.
 */
function scoreCandidate(
  model: ModelProfile,
  intent: ClassifiedIntent,
  complexity: string,
  qualityFloor: number,
  thinkingEnabled: boolean,
  preferredProvider: string | undefined,
  conversationModelId: string | undefined,
): number {
  let score = 0;

  // A. Strength / weakness match
  if (model.strengths.includes(intent.intent)) score += W.STRENGTH_MATCH;
  if (model.weaknesses.includes(intent.intent)) score += W.WEAKNESS_PENALTY;

  // B. Quality-cost efficiency
  const qNeeded = Math.min(qualityFloor, 5);
  if (model.qualityTier === qNeeded) score += W.QUALITY_EXACT;
  else if (model.qualityTier === qNeeded + 1) score += W.QUALITY_PLUS_ONE;
  else if (model.qualityTier > qNeeded + 1) score += W.QUALITY_OVERKILL;

  // C. Cost efficiency — cheaper is better when quality is equal
  score += (5 - model.costTier) * W.COST_PER_TIER;

  // D. Speed bonus for simple tasks
  if (complexity === 'simple') score += model.speedTier * W.SPEED_SIMPLE;

  // E. Provider preference
  if (preferredProvider && model.provider === preferredProvider) score += W.PROVIDER_PREF;

  // F. Conversation continuity
  if (conversationModelId && model.dbId === conversationModelId) score += W.CONVERSATION_CONTINUITY;

  // G. Thinking mode
  if (thinkingEnabled && model.supportsThinking) score += W.THINKING_NATIVE;

  // H. Special routing rules
  if (intent.intent === 'conversation' && complexity === 'simple' && model.costTier <= 1) {
    score += W.CONVERSATION_NANO;
  }
  if (intent.intent === 'coding' && ['codestral-latest', 'gpt-5.4', 'claude-sonnet-4-6'].includes(model.modelId)) {
    score += W.CODING_SPECIALIST;
  }
  if (intent.intent === 'research' && !thinkingEnabled && model.provider === 'perplexity') {
    score += W.RESEARCH_PERPLEXITY;
  }
  if (intent.intent === 'math') {
    if (model.supportsThinking) score += W.MATH_REASONING;
    if (['o3', 'o4-mini', 'deepseek-reasoner'].includes(model.modelId)) score += W.MATH_SPECIALIST;
  }
  if ((intent.intent === 'long_form_writing' || intent.intent === 'creative_writing') && model.provider === 'anthropic') {
    score += W.WRITING_ANTHROPIC;
  }

  return score;
}

/**
 * Main routing function. Call instead of manual model selection.
 */
export function routeToOptimalModel(input: RouterInput): RouterResult {
  const {
    intent, complexity, hasVisionContent, thinkingEnabled,
    tokenBalance, estimatedInputTokens, preferredProvider,
    excludeModelIds, conversationModelId,
  } = input;

  // Step 1 — eligible candidates: have a DB ID and are not excluded
  let candidates = MODEL_PROFILES.filter(m => {
    if (!m.dbId) return false;
    if (excludeModelIds?.includes(m.dbId)) return false;
    return true;
  });

  if (candidates.length === 0) {
    const fallback = MODEL_PROFILES.find(m => m.dbId) || MODEL_PROFILES[0];
    logger.warn('LLM Router: no eligible candidates after filtering — using first available');
    return { selectedModel: fallback, reason: 'Fallback — no eligible models', confidence: 0.1, alternatives: [] };
  }

  // Step 2 — hard capability requirements
  if (hasVisionContent) {
    const vision = candidates.filter(m => m.supportsVision);
    if (vision.length > 0) candidates = vision;
  }
  if (thinkingEnabled) {
    const thinking = candidates.filter(m => m.supportsThinking);
    if (thinking.length > 0) candidates = thinking;
  }

  // Step 3 — context window: model must fit the estimated input with 30% headroom
  candidates = candidates.filter(m => m.contextWindow >= estimatedInputTokens * 1.3);
  if (candidates.length === 0) {
    // Fall back to any model — better than refusing to answer
    candidates = MODEL_PROFILES.filter(m => m.dbId).sort((a, b) => b.contextWindow - a.contextWindow);
  }

  // Step 4 — quality floor
  const qualityFloor = (QUALITY_FLOORS[complexity] ?? 2) + (INTENT_QUALITY_BONUS[intent.intent] ?? 0);
  const qualified = candidates.filter(m => m.qualityTier >= qualityFloor);
  if (qualified.length > 0) candidates = qualified;

  // Step 5 — cost ceiling based on wallet balance
  const maxCost = getMaxCostTier(tokenBalance);
  const affordable = candidates.filter(m => m.costTier <= maxCost);
  if (affordable.length > 0) candidates = affordable;

  // Step 6 — score and rank
  const scored = candidates
    .map(model => ({
      model,
      score: scoreCandidate(model, intent, complexity, qualityFloor, thinkingEnabled, preferredProvider, conversationModelId),
    }))
    .sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const alternatives = scored.slice(1, 4).map(s => s.model);

  // Cost savings vs the best quality model available
  const flagship = scored.find(s => s.model.qualityTier === 5);
  let costSavings: string | undefined;
  if (flagship && flagship.model.modelId !== winner.model.modelId) {
    const tierDiff = flagship.model.costTier - winner.model.costTier;
    if (tierDiff > 0) {
      costSavings = `~${tierDiff * 40}% cheaper than ${flagship.model.displayName}`;
    }
  }

  const reason = buildReason(winner.model, intent, complexity, thinkingEnabled);
  const confidence = Math.min(winner.score / 80, 1);

  logger.info(
    `LLM Router: ${intent.intent}/${complexity} → ${winner.model.displayName}` +
    ` (score=${winner.score}, cost=${winner.model.costTier}, quality=${winner.model.qualityTier})` +
    (costSavings ? ` | ${costSavings}` : ''),
  );

  return { selectedModel: winner.model, reason, confidence, alternatives, costSavings };
}

function buildReason(
  model: ModelProfile,
  intent: ClassifiedIntent,
  complexity: string,
  thinking: boolean,
): string {
  const intentLabel = intent.intent.replace(/_/g, ' ');
  const parts: string[] = [];

  if (complexity === 'simple') {
    parts.push(`Fast and efficient for ${intentLabel}`);
  } else if (complexity === 'complex') {
    parts.push(`Complex ${intentLabel} requires ${model.displayName}'s capabilities`);
  } else {
    parts.push(`Best cost-quality balance for ${intentLabel}`);
  }

  if (thinking) parts.push('native reasoning enabled');
  if (model.strengths.includes(intent.intent)) parts.push('specialised for this task');

  return parts.join(' \u2014 ');
}

/**
 * Quick top-3 recommendation for a given intent/complexity (no full scoring).
 * Useful for UI hints before the user sends a message.
 */
export function getQuickRecommendations(intent: TaskIntent, complexity: string): ModelProfile[] {
  const qualityFloor = (QUALITY_FLOORS[complexity] ?? 2) + (INTENT_QUALITY_BONUS[intent] ?? 0);
  return MODEL_PROFILES
    .filter(m => m.dbId && m.qualityTier >= qualityFloor && m.strengths.includes(intent))
    .sort((a, b) => b.qualityTier !== a.qualityTier ? b.qualityTier - a.qualityTier : a.costTier - b.costTier)
    .slice(0, 3);
}
