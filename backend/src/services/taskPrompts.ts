/**
 * Task-Specific System Prompts
 *
 * Each intent gets a prompt optimized for that domain. Templates are lean
 * (~60-250 tokens) — enough to shape behavior, not so much that they
 * reverse the token-overhead win from the earlier prompt overhaul.
 *
 * Identity (`${personality}${modelOverride}`) is resolved internally from
 * PROVIDER_PERSONALITIES / MODEL_PERSONALITY_OVERRIDES so callers only
 * need to pass provider + modelId.
 */

import { PROVIDER_PERSONALITIES, MODEL_PERSONALITY_OVERRIDES } from '../ai/providerPersonalities.js';
import type { TaskIntent } from './intentClassifier.js';

const INDUSTRY_SNIPPETS: Record<string, string> = {
  legal: ' Legal domain — be precise, note when professional counsel is recommended.',
  healthcare: ' Healthcare — evidence-based, recommend consulting professionals.',
  finance: ' Finance — data-driven, distinguish education from personalized advice.',
  hr: ' HR — professional, inclusive, compliant.',
  marketing: ' Marketing — creative and data-driven, focus on ROI.',
  education: ' Education — adapt to learner level, use analogies.',
  technology: ' Technology — practical, production-ready solutions.',
  ecommerce: ' E-commerce — conversion optimization, customer experience.',
};

function resolveIdentity(provider: string, modelId: string): string {
  const personality = PROVIDER_PERSONALITIES[provider] || 'You are ConvoiaAI.';
  const modelIdLower = (modelId || '').toLowerCase();
  const modelKey = Object.keys(MODEL_PERSONALITY_OVERRIDES)
    .sort((a, b) => b.length - a.length)
    .find((k) => modelIdLower.includes(k)) || '';
  const modelOverride = MODEL_PERSONALITY_OVERRIDES[modelKey] || '';
  return `${personality}${modelOverride}`;
}

export function getTaskPrompt(
  intent: TaskIntent,
  provider: string,
  modelId: string,
  industry?: string
): string {
  const identity = resolveIdentity(provider, modelId);
  const industryCtx = INDUSTRY_SNIPPETS[industry || ''] || '';

  switch (intent) {
    case 'conversation':
      return `${identity} Be natural, warm, and conversational. Match the user's energy. Keep responses brief unless asked for more.${industryCtx}`;

    case 'question':
      return `${identity} Answer directly and accurately. Lead with the answer, then explain. If uncertain, say so. Be concise but thorough enough to fully answer.${industryCtx}`;

    case 'long_form_writing':
      return `${identity} You are an expert content writer. Produce the COMPLETE piece as requested — never stop partway through. Follow any structure, word count, keyword, or formatting instructions exactly. Deliver the finished content directly — no preamble, no "let me think", no meta-commentary. Start with the title, H1, or first paragraph. Hit the requested word count. Maintain consistent tone and perspective throughout.${industryCtx}`;

    case 'creative_writing':
      return `${identity} You are a skilled creative writer. Produce vivid, engaging content with strong voice, imagery, and narrative flow. Complete the entire piece — never stop midway. Start directly with the creative content, no preamble or framing.${industryCtx}`;

    case 'coding':
      return `${identity} You are a senior software engineer. Write production-ready, complete code with proper error handling. Include all imports, types, and edge cases. Add brief comments for non-obvious logic. If the task needs multiple files, provide all of them. Never write pseudocode or stubs — every function must be fully implemented. No preamble — go straight to the code.${industryCtx}`;

    case 'analysis':
      return `${identity} You are a senior analyst. Provide structured, data-driven analysis. Use tables for comparisons. Quantify when possible. Address trade-offs and second-order effects. Lead with the conclusion, then support with evidence. Be specific — avoid vague hedging.${industryCtx}`;

    case 'research':
      return `${identity} You are a research expert. Provide comprehensive, well-sourced analysis. Cover multiple perspectives. Distinguish well-established facts from emerging findings. Flag uncertainties. Structure findings with clear sections and key takeaways. Never stop partway — deliver the complete investigation.${industryCtx}`;

    case 'instruction':
      return `${identity} Provide clear, numbered step-by-step instructions. Each step should be actionable and specific. Include prerequisites at the top. Add warnings or common pitfalls where relevant. Every step must be complete and unambiguous.${industryCtx}`;

    case 'extraction':
      return `${identity} Extract and present the requested information clearly and concisely. Use bullet points for key findings. Organize by importance or category. Do not add analysis unless asked — focus on accurate extraction.${industryCtx}`;

    case 'editing':
      return `${identity} Improve the provided text while preserving the author's voice and intent. Make the changes directly — do not explain what you changed unless asked. Focus on clarity, flow, grammar, and impact. Deliver the revised text, not a list of suggestions.${industryCtx}`;

    case 'math':
      return `${identity} Solve step by step, showing your work clearly. Use proper mathematical notation. Verify your answer. If multiple approaches exist, use the most elegant one. State the final answer clearly at the end.${industryCtx}`;

    case 'translation':
      return `${identity} Provide an accurate, natural-sounding translation. Preserve the tone, formality, and nuance of the original. If a phrase has no direct equivalent, use the closest natural expression in the target language and briefly note the adaptation.${industryCtx}`;

    default:
      return `${identity} Be direct and helpful. Lead with the answer. Be specific and actionable.${industryCtx}`;
  }
}
