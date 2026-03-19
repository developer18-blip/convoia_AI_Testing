/**
 * Token Cost Calculation Service
 * Calculates the estimated cost of AI model API calls based on input/output tokens
 */

interface TokenPricing {
  inputTokenPrice: number;  // Price per 1K tokens
  outputTokenPrice: number; // Price per 1K tokens
}

/**
 * Calculate the cost of tokens used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param pricing - Token pricing information
 * @returns Cost in USD
 */
export const calculateTokenCost = (
  inputTokens: number,
  outputTokens: number,
  pricing: TokenPricing
): number => {
  const inputCost = (inputTokens / 1000) * pricing.inputTokenPrice;
  const outputCost = (outputTokens / 1000) * pricing.outputTokenPrice;
  return parseFloat((inputCost + outputCost).toFixed(6));
};

/**
 * Get estimated cost for a prompt (before API call)
 * Uses character-to-token estimation (approximate)
 */
export const estimatePromptTokens = (text: string): number => {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
};

/**
 * Common model pricing (per 1000 tokens in USD)
 * Update these based on current pricing from providers
 */
export const modelPricing: Record<string, TokenPricing> = {
  'gpt-4-turbo': {
    inputTokenPrice: 0.01,
    outputTokenPrice: 0.03,
  },
  'gpt-4': {
    inputTokenPrice: 0.03,
    outputTokenPrice: 0.06,
  },
  'gpt-3.5-turbo': {
    inputTokenPrice: 0.0005,
    outputTokenPrice: 0.0015,
  },
  'claude-3-opus': {
    inputTokenPrice: 0.015,
    outputTokenPrice: 0.075,
  },
  'claude-3-sonnet': {
    inputTokenPrice: 0.003,
    outputTokenPrice: 0.015,
  },
  'claude-3-haiku': {
    inputTokenPrice: 0.00025,
    outputTokenPrice: 0.00125,
  },
  'gemini-pro': {
    inputTokenPrice: 0.000125,
    outputTokenPrice: 0.000375,
  },
  'gemini-pro-vision': {
    inputTokenPrice: 0.0025,
    outputTokenPrice: 0.0075,
  },
  'mistral-large': {
    inputTokenPrice: 0.008,
    outputTokenPrice: 0.024,
  },
  'mistral-medium': {
    inputTokenPrice: 0.0027,
    outputTokenPrice: 0.0081,
  },
  'deepseek-coder': {
    inputTokenPrice: 0.0008,
    outputTokenPrice: 0.0016,
  },
};

/**
 * Get pricing for a model
 */
export const getModelPricing = (modelName: string): TokenPricing => {
  return (
    modelPricing[modelName] || {
      inputTokenPrice: 0.001,
      outputTokenPrice: 0.001,
    }
  );
};
