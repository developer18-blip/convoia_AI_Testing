/**
 * Lightweight Model Intelligence Registry
 *
 * Provides model metadata for the thinking pipeline:
 * tier, provider, reasoning capability, display name.
 * Uses longest-first fuzzy matching (same as thinkModeParams).
 */

export interface ModelIntelligence {
  displayName: string;
  provider: 'openai' | 'anthropic' | 'google' | 'deepseek' | 'mistral' | 'groq' | 'perplexity' | 'xai';
  tier: 'flagship' | 'standard' | 'fast';
  isReasoningModel: boolean;
}

const MODEL_INTELLIGENCE: Record<string, ModelIntelligence> = {
  // ── OpenAI ──
  'gpt-5.4':      { displayName: 'GPT-5.4', provider: 'openai', tier: 'flagship', isReasoningModel: true },
  'gpt-5.4-pro':  { displayName: 'GPT-5.4 Pro', provider: 'openai', tier: 'flagship', isReasoningModel: true },
  'gpt-5.4-mini': { displayName: 'GPT-5.4 Mini', provider: 'openai', tier: 'fast', isReasoningModel: false },
  'gpt-5.4-nano': { displayName: 'GPT-5.4 Nano', provider: 'openai', tier: 'fast', isReasoningModel: false },
  'gpt-5':        { displayName: 'GPT-5', provider: 'openai', tier: 'flagship', isReasoningModel: true },
  'gpt-5-mini':   { displayName: 'GPT-5 Mini', provider: 'openai', tier: 'fast', isReasoningModel: false },
  'gpt-4.1':      { displayName: 'GPT-4.1', provider: 'openai', tier: 'standard', isReasoningModel: false },
  'gpt-4.1-mini': { displayName: 'GPT-4.1 Mini', provider: 'openai', tier: 'fast', isReasoningModel: false },
  'gpt-4.1-nano': { displayName: 'GPT-4.1 Nano', provider: 'openai', tier: 'fast', isReasoningModel: false },
  'gpt-4o':       { displayName: 'GPT-4o', provider: 'openai', tier: 'standard', isReasoningModel: false },
  'gpt-4o-mini':  { displayName: 'GPT-4o Mini', provider: 'openai', tier: 'fast', isReasoningModel: false },
  'o3':           { displayName: 'o3', provider: 'openai', tier: 'flagship', isReasoningModel: true },
  'o4-mini':      { displayName: 'o4-mini', provider: 'openai', tier: 'standard', isReasoningModel: true },
  'o3-mini':      { displayName: 'o3-mini', provider: 'openai', tier: 'fast', isReasoningModel: true },

  // ── Anthropic ──
  'claude-opus-4-6':   { displayName: 'Claude Opus 4.6', provider: 'anthropic', tier: 'flagship', isReasoningModel: true },
  'claude-opus-4-5':   { displayName: 'Claude Opus 4.5', provider: 'anthropic', tier: 'flagship', isReasoningModel: true },
  'claude-sonnet-4-6': { displayName: 'Claude Sonnet 4.6', provider: 'anthropic', tier: 'standard', isReasoningModel: true },
  'claude-sonnet-4-5': { displayName: 'Claude Sonnet 4.5', provider: 'anthropic', tier: 'standard', isReasoningModel: true },
  'claude-haiku':      { displayName: 'Claude Haiku', provider: 'anthropic', tier: 'fast', isReasoningModel: false },

  // ── Google ──
  'gemini-3.1-pro':     { displayName: 'Gemini 3.1 Pro', provider: 'google', tier: 'flagship', isReasoningModel: true },
  'gemini-2.5-pro':     { displayName: 'Gemini 2.5 Pro', provider: 'google', tier: 'flagship', isReasoningModel: true },
  'gemini-2.5-flash':   { displayName: 'Gemini 2.5 Flash', provider: 'google', tier: 'standard', isReasoningModel: true },
  'gemini-2.5-flash-lite': { displayName: 'Gemini 2.5 Flash Lite', provider: 'google', tier: 'fast', isReasoningModel: false },
  'gemini-2.0-flash':   { displayName: 'Gemini 2.0 Flash', provider: 'google', tier: 'fast', isReasoningModel: false },

  // ── DeepSeek ──
  'deepseek-chat':     { displayName: 'DeepSeek Chat', provider: 'deepseek', tier: 'standard', isReasoningModel: false },
  'deepseek-reasoner': { displayName: 'DeepSeek Reasoner', provider: 'deepseek', tier: 'standard', isReasoningModel: true },

  // ── Mistral ──
  'mistral-large':  { displayName: 'Mistral Large', provider: 'mistral', tier: 'standard', isReasoningModel: false },
  'mistral-medium': { displayName: 'Mistral Medium', provider: 'mistral', tier: 'standard', isReasoningModel: false },
  'mistral-small':  { displayName: 'Mistral Small', provider: 'mistral', tier: 'fast', isReasoningModel: false },
  'codestral':      { displayName: 'Codestral', provider: 'mistral', tier: 'standard', isReasoningModel: false },

  // ── Groq ──
  'llama-3.3-70b': { displayName: 'Llama 3.3 70B', provider: 'groq', tier: 'standard', isReasoningModel: false },
  'llama-3.1-8b':  { displayName: 'Llama 3.1 8B', provider: 'groq', tier: 'fast', isReasoningModel: false },
  'mixtral-8x7b':  { displayName: 'Mixtral 8x7B', provider: 'groq', tier: 'standard', isReasoningModel: false },

  // ── Perplexity ──
  'sonar-deep-research':  { displayName: 'Sonar Deep Research', provider: 'perplexity', tier: 'flagship', isReasoningModel: true },
  'sonar-reasoning-pro':  { displayName: 'Sonar Reasoning Pro', provider: 'perplexity', tier: 'standard', isReasoningModel: true },
  'sonar-pro':            { displayName: 'Sonar Pro', provider: 'perplexity', tier: 'standard', isReasoningModel: false },
  'sonar':                { displayName: 'Sonar', provider: 'perplexity', tier: 'fast', isReasoningModel: false },

  // ── xAI ──
  'grok-4.20-0309-reasoning':     { displayName: 'Grok 4.20 Reasoning', provider: 'xai', tier: 'flagship', isReasoningModel: true },
  'grok-4.20-0309-non-reasoning': { displayName: 'Grok 4.20', provider: 'xai', tier: 'flagship', isReasoningModel: false },
  'grok-4-1-fast-reasoning':      { displayName: 'Grok 4.1 Fast Reasoning', provider: 'xai', tier: 'standard', isReasoningModel: true },
  'grok-4-1-fast-non-reasoning':  { displayName: 'Grok 4.1 Fast', provider: 'xai', tier: 'fast', isReasoningModel: false },
  'grok-3':      { displayName: 'Grok 3', provider: 'xai', tier: 'standard', isReasoningModel: false },
  'grok-3-fast': { displayName: 'Grok 3 Fast', provider: 'xai', tier: 'fast', isReasoningModel: false },
  'grok-3-mini': { displayName: 'Grok 3 Mini', provider: 'xai', tier: 'fast', isReasoningModel: false },
};

/**
 * Get model intelligence metadata by modelId.
 * Uses longest-first fuzzy matching (same as thinkModeParams).
 */
export function getModelIntelligence(modelId: string): ModelIntelligence | null {
  if (!modelId) return null;
  const lower = modelId.toLowerCase();
  const matchedKey = Object.keys(MODEL_INTELLIGENCE)
    .sort((a, b) => b.length - a.length)
    .find(k => lower.includes(k));
  return matchedKey ? MODEL_INTELLIGENCE[matchedKey] : null;


  
}
