/**
 * Smart Model Recommendation Service
 *
 * Rule-based (ZERO token cost) — analyzes user input to suggest the best model.
 * Does NOT call any LLM. Uses keyword/pattern matching only.
 */

import logger from '../config/logger.js';

export interface ModelRecommendation {
  bestFor: string;           // "Claude Haiku 4.5"
  bestForReason: string;     // "Best for writing tasks"
  fastOption: string;        // "Gemini 2.5 Flash"
  fastReason: string;        // "3x faster response"
  cheapOption: string;       // "GPT-4o Mini"
  cheapReason: string;       // "Lowest cost per token"
  taskType: TaskType;
}

type TaskType = 'coding' | 'writing' | 'analysis' | 'math' | 'creative' | 'research' | 'translation' | 'general' | 'image';

// Task detection patterns (rule-based, zero cost)
const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
  coding: [
    /\b(code|program|script|function|class|api|endpoint|bug|debug|fix|implement|develop|build|deploy|docker|kubernetes|sql|html|css|javascript|typescript|python|react|node|express|prisma|database)\b/i,
    /\b(algorithm|data structure|leetcode|regex|refactor|optimize|compile|runtime|stack trace|error|exception)\b/i,
    /```[\s\S]*```/,
  ],
  writing: [
    /\b(write|draft|compose|essay|article|blog|email|letter|copy|content|story|poem|script|speech|proposal|report)\b/i,
    /\b(rewrite|edit|proofread|grammar|tone|style|headline|tagline|slogan|bio|resume|cv|cover letter)\b/i,
  ],
  analysis: [
    /\b(analyze|analysis|compare|evaluate|assess|review|audit|benchmark|pros.*cons|swot|pestel|porter)\b/i,
    /\b(data|metrics|statistics|trend|insight|pattern|correlation|regression|forecast)\b/i,
  ],
  math: [
    /\b(calculate|compute|solve|equation|formula|math|algebra|calculus|geometry|probability|statistics)\b/i,
    /\b(integral|derivative|matrix|vector|theorem|proof|optimization)\b/i,
    /[0-9]+\s*[\+\-\*\/\^]\s*[0-9]+/,
  ],
  creative: [
    /\b(creative|brainstorm|idea|concept|innovate|imagine|invent|design|brand|marketing|campaign|slogan)\b/i,
    /\b(story|narrative|character|plot|worldbuild|fiction|fantasy|sci-fi)\b/i,
  ],
  research: [
    /\b(research|investigate|find|search|look up|what is|who is|when did|how does|explain|define|history of)\b/i,
    /\b(source|reference|citation|paper|study|survey|literature)\b/i,
  ],
  translation: [
    /\b(translate|translation|convert|in \w+ language|to \w+|from \w+ to)\b/i,
    /\b(hindi|spanish|french|german|chinese|japanese|arabic|korean|portuguese|russian|italian)\b/i,
  ],
  general: [], // fallback
  image: [], // handled by image intent service
};

// Model recommendations per task type
const RECOMMENDATIONS: Record<TaskType, Omit<ModelRecommendation, 'taskType'>> = {
  coding: {
    bestFor: 'Claude Sonnet 4.6',
    bestForReason: 'Best for code generation & debugging',
    fastOption: 'GPT-4.1 Mini',
    fastReason: '3x faster for simple code tasks',
    cheapOption: 'DeepSeek Chat',
    cheapReason: 'Excellent coder at lowest cost',
  },
  writing: {
    bestFor: 'Claude Opus 4.6',
    bestForReason: 'Highest quality writing & creativity',
    fastOption: 'Claude Haiku 4.5',
    fastReason: 'Good writing, much faster',
    cheapOption: 'Gemini 2.5 Flash',
    cheapReason: 'Solid writing at minimal cost',
  },
  analysis: {
    bestFor: 'GPT-4.1',
    bestForReason: 'Deep analytical reasoning',
    fastOption: 'Gemini 2.5 Flash',
    fastReason: 'Fast analysis with large context',
    cheapOption: 'GPT-4.1 Mini',
    cheapReason: 'Good analysis at lower cost',
  },
  math: {
    bestFor: 'o3',
    bestForReason: 'Advanced mathematical reasoning',
    fastOption: 'o4 Mini',
    fastReason: 'Fast reasoning model',
    cheapOption: 'DeepSeek Reasoner',
    cheapReason: 'Strong math at low cost',
  },
  creative: {
    bestFor: 'Claude Opus 4.6',
    bestForReason: 'Most creative & nuanced output',
    fastOption: 'GPT-4o',
    fastReason: 'Creative & fast',
    cheapOption: 'Gemini 2.5 Flash',
    cheapReason: 'Creative output at minimal cost',
  },
  research: {
    bestFor: 'Gemini 2.5 Pro',
    bestForReason: '1M context + grounding with search',
    fastOption: 'Gemini 2.5 Flash',
    fastReason: 'Fast with large context window',
    cheapOption: 'GPT-4o Mini',
    cheapReason: 'Quick research at low cost',
  },
  translation: {
    bestFor: 'GPT-4.1',
    bestForReason: 'Most accurate translations',
    fastOption: 'Gemini 2.5 Flash',
    fastReason: 'Fast multilingual support',
    cheapOption: 'GPT-4.1 Nano',
    cheapReason: 'Good translations at lowest cost',
  },
  general: {
    bestFor: 'Claude Haiku 4.5',
    bestForReason: 'Fast, balanced, cost-effective',
    fastOption: 'Gemini 2.5 Flash',
    fastReason: 'Fastest general model',
    cheapOption: 'GPT-4o Mini',
    cheapReason: 'Cheapest general-purpose model',
  },
  image: {
    bestFor: 'Gemini Flash Image',
    bestForReason: 'High quality, free tier',
    fastOption: 'DALL-E 3',
    fastReason: 'Fast image generation',
    cheapOption: 'Gemini Flash Image',
    cheapReason: 'Free tier (1500/day)',
  },
};

/**
 * Analyze a user message and recommend models.
 * ZERO token cost — entirely rule-based.
 */
export function getModelRecommendation(message: string): ModelRecommendation {
  const taskType = detectTaskType(message);
  const rec = RECOMMENDATIONS[taskType];

  return {
    ...rec,
    taskType,
  };
}

function detectTaskType(message: string): TaskType {
  const scores: Partial<Record<TaskType, number>> = {};

  for (const [type, patterns] of Object.entries(TASK_PATTERNS)) {
    if (type === 'general' || type === 'image') continue;
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) score++;
    }
    if (score > 0) scores[type as TaskType] = score;
  }

  // Find highest scoring type
  let best: TaskType = 'general';
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = type as TaskType;
    }
  }

  return best;
}

/**
 * Response cache — in-memory with TTL.
 * Saves tokens by reusing identical responses.
 */
const responseCache = new Map<string, { response: string; timestamp: number; tokens: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(prompt: string, modelId: string): string {
  // Normalize: trim, lowercase, first 500 chars
  return `${modelId}:${prompt.trim().toLowerCase().substring(0, 500)}`;
}

export function getCachedResponse(prompt: string, modelId: string): { response: string; tokens: number } | null {
  const key = getCacheKey(prompt, modelId);
  const cached = responseCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info(`Cache hit for model=${modelId}, saved tokens`);
    return { response: cached.response, tokens: cached.tokens };
  }

  // Clean expired
  if (cached) responseCache.delete(key);
  return null;
}

export function setCachedResponse(prompt: string, modelId: string, response: string, tokens: number): void {
  const key = getCacheKey(prompt, modelId);
  responseCache.set(key, { response, timestamp: Date.now(), tokens });

  // Evict if cache too large (max 200 entries)
  if (responseCache.size > 200) {
    const oldest = [...responseCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) responseCache.delete(oldest[0]);
  }
}

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of responseCache.entries()) {
    if (now - val.timestamp > CACHE_TTL) responseCache.delete(key);
  }
}, 60_000);
