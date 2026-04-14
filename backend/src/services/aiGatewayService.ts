import axios, { AxiosRequestConfig } from 'axios';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import prisma from '../config/db.js';
import { PROVIDER_PERSONALITIES, MODEL_PERSONALITY_OVERRIDES } from '../ai/providerPersonalities.js';

// Smart context windowing — keeps conversation within model limits
// Always keeps: first 2 messages (for context) + system prompt + last N messages
// Helper: get text length from content (handles string or multimodal array)
function contentLength(content: any): number {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    return content.reduce((sum: number, part: any) => {
      if (part.type === 'text') return sum + (part.text?.length || 0);
      if (part.type === 'image_url') return sum + 1000; // rough estimate per image
      return sum;
    }, 0);
  }
  return 0;
}

function trimToContextWindow(messages: Array<{ role: string; content: any }>, maxTokens: number): Array<{ role: string; content: any }> {
  // Estimate ~4 chars per token, reserve 30% for output
  const maxInputTokens = Math.floor(maxTokens * 0.7);
  const maxInputChars = maxInputTokens * 4;

  let totalChars = 0;
  for (const m of messages) totalChars += contentLength(m.content);
  const estimatedTokens = Math.ceil(totalChars / 4);

  // If within limits, send everything
  if (estimatedTokens <= maxInputTokens) return messages;

  // SINGLE MESSAGE CASE: if there's only 1-2 messages and they're too long, truncate the content
  if (messages.length <= 2) {
    return messages.map(m => {
      const len = contentLength(m.content);
      if (len <= maxInputChars) return m;
      // Truncate the message content
      if (typeof m.content === 'string') {
        const truncated = m.content.substring(0, maxInputChars - 200);
        const droppedChars = m.content.length - truncated.length;
        logger.warn(`Truncated single message from ${len} to ${maxInputChars - 200} chars (dropped ${droppedChars} chars to fit ${maxTokens} token context window)`);
        return { ...m, content: truncated + `\n\n[Content truncated — ${Math.ceil(droppedChars / 4)} tokens exceeded the model's context window. The first ~${Math.ceil(truncated.length / 4)} tokens are included above.]` };
      }
      // Array content (multimodal) — truncate text parts
      if (Array.isArray(m.content)) {
        return { ...m, content: m.content.map((part: any) => {
          if (part.type === 'text' && part.text && part.text.length > maxInputChars) {
            return { ...part, text: part.text.substring(0, maxInputChars - 200) + '\n\n[Content truncated to fit context window]' };
          }
          return part;
        })};
      }
      return m;
    });
  }

  // MULTI-MESSAGE CASE: keep first 2 messages (context anchor) + as many recent messages as fit
  const first = messages.slice(0, 2);
  const rest = messages.slice(2);
  const firstChars = first.reduce((s, m) => s + contentLength(m.content), 0);
  const budget = maxInputChars - firstChars - 200;

  // Walk backwards through remaining messages
  const kept: Array<{ role: string; content: any }> = [];
  let used = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const msgChars = contentLength(rest[i].content);
    if (used + msgChars > budget) break;
    kept.unshift(rest[i]);
    used += msgChars;
  }

  // Add summary marker if we trimmed
  if (kept.length < rest.length) {
    const trimmed = rest.length - kept.length;
    const summaryMsg = { role: 'system' as const, content: `[${trimmed} earlier messages omitted to fit context window. The conversation continues below.]` };
    return [...first, summaryMsg, ...kept];
  }

  return [...first, ...kept];
}

// Model context window sizes (in tokens)
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000, 'gpt-4o-mini': 128000,
  'gpt-4.1': 1000000, 'gpt-4.1-mini': 1000000, 'gpt-4.1-nano': 1000000,
  'gpt-5': 1000000, 'gpt-5-mini': 1000000,
  'gpt-5.4': 1050000, 'gpt-5.4-pro': 1050000, 'gpt-5.4-mini': 1050000, 'gpt-5.4-nano': 1050000,
  'o3': 200000, 'o3-mini': 200000, 'o4-mini': 200000,
  'claude-opus-4-6': 1000000, 'claude-opus-4-5-20251101': 200000,
  'claude-sonnet-4-6': 1000000, 'claude-sonnet-4-5-20250929': 200000,
  'claude-haiku-4-5-20251001': 200000,
  'gemini-3.1-pro-preview': 2000000, 'gemini-3-pro': 1000000,
  'gemini-2.5-pro': 1000000, 'gemini-2.5-flash': 1000000,
  'gemini-2.5-flash-lite': 1000000, 'gemini-2.0-flash': 1000000,
  'deepseek-chat': 128000, 'deepseek-reasoner': 128000,
  'mistral-large-latest': 256000, 'mistral-medium-latest': 131072,
  'mistral-small-latest': 128000, 'codestral-latest': 32768,
  'llama-3.3-70b-versatile': 128000, 'llama-3.1-8b-instant': 128000,
  'mixtral-8x7b-32768': 32768,
  // xAI / Grok
  'grok-3': 131072, 'grok-3-mini': 131072, 'grok-3-fast': 131072,
  'grok-3-mini-fast': 131072,
  'grok-4.20-0309-non-reasoning': 2000000, 'grok-4.20-0309-reasoning': 2000000,
  'grok-4-1-fast-non-reasoning': 2000000, 'grok-4-1-fast-reasoning': 2000000,
  // Perplexity
  'sonar-pro': 200000, 'sonar': 127000, 'sonar-reasoning-pro': 128000,
  'sonar-reasoning': 127000, 'sonar-deep-research': 128000,
};

// ── Multimodal message formatting per provider ──────────────────────
// Converts our generic format (OpenAI-style image_url with _base64/_mimeType extras)
// into each provider's expected format.

function formatMessagesForOpenAI(messages: any[]): any[] {
  return messages.map((m: any) => {
    if (!Array.isArray(m.content)) return m;
    // OpenAI accepts image_url natively — just strip our extra fields
    const parts = m.content.map((p: any) => {
      if (p.type === 'image_url') return { type: 'image_url', image_url: p.image_url };
      return p;
    });
    return { ...m, content: parts };
  });
}

function formatMessagesForAnthropic(messages: any[]): any[] {
  return messages.map((m: any) => {
    if (!Array.isArray(m.content)) return m;
    const parts = m.content.map((p: any) => {
      if (p.type === 'image_url') {
        return {
          type: 'image',
          source: { type: 'base64', media_type: p._mimeType || 'image/jpeg', data: p._base64 || '' },
        };
      }
      return p;
    });
    return { ...m, content: parts };
  });
}

function formatPartsForGoogle(content: any): any[] {
  if (typeof content === 'string') return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: String(content) }];
  return content.map((p: any) => {
    if (p.type === 'text') return { text: p.text };
    if (p.type === 'image_url') {
      return { inlineData: { mimeType: p._mimeType || 'image/jpeg', data: p._base64 || '' } };
    }
    return { text: String(p.text || '') };
  });
}

interface AgentConfig {
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  name: string;
}

interface SendMessageParams {
  userId: string;
  organizationId: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  industry?: string;
  agentConfig?: AgentConfig;
  maxOutputTokens?: number; // Cap output to user's available token balance
  memoryContext?: string; // Persistent user memory to inject into system prompt
  thinkingEnabled?: boolean; // Enable extended thinking (Claude only)
  webSearchActive?: boolean; // Augment system prompt with web search formatting rules
  complexity?: 'simple' | 'standard' | 'complex'; // Query complexity for prompt sizing
}

interface SendVisionParams {
  userId: string;
  organizationId: string;
  modelId: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  industry?: string;
  maxOutputTokens?: number;
}

interface AIResponse {
  response: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  providerCost: number;
  customerPrice: number;
  profit: number;
  markupPercentage: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  aiModel: any;
}

// Shared timeout config for all provider calls
const axiosConfig = (headers: Record<string, string>): AxiosRequestConfig => ({
  headers,
  timeout: config.aiRequestTimeout,
});

/**
 * Classify query complexity to right-size the system prompt.
 * Simple queries (pure greetings/acknowledgments/small talk) get a lightweight prompt.
 * A greeting followed by a real question is STANDARD, not simple.
 */
export function classifyQueryComplexity(message: string): 'simple' | 'standard' | 'complex' {
  const trimmed = message.trim();
  const wordCount = trimmed.split(/\s+/).length;

  // Simple: pure greetings, acknowledgments, and small talk.
  // The ENTIRE message must be one of these — "hey can you help me with X" is NOT simple.
  const simplePatterns = /^(hey|hi|hello|yo|sup|thanks|thank you|ok|okay|yes|no|bye|good morning|good night|gm|gn|hm+|lol|haha|nice|cool|great|sure|nah|yep|yup|nope|good|fine|perfect|exactly|right|agreed|same|ty|thx|kk|cheers|word|bet|aight|gotcha|roger|copy|noted|wow|damn|dang|omg|oh|ah|hmm|mhm)[\s!?.,]*$/i;

  // Small-talk patterns — slightly longer but still greetings/pleasantries
  const smallTalkPatterns = /^(what's up|what is up|whats up|how are you|how r u|how you doing|how're you|how ya doin|how's it going|hows it going|how's the day|hows the day|how's your day|hows your day|how's everything|hows everything|what's new|whats new|what's good|whats good|long time no see|nice to meet you|pleased to meet you|how have you been|hbu|hyd|wyd|wbu)[\s!?.,a-z]*$/i;

  if ((simplePatterns.test(trimmed) && wordCount <= 4) || smallTalkPatterns.test(trimmed)) {
    return 'simple';
  }

  // Complex: long messages, code blocks, multiple questions, technical markers
  if (
    trimmed.length > 500 ||
    wordCount > 100 ||
    trimmed.includes('```') ||
    (trimmed.match(/\?/g) || []).length >= 3
  ) {
    return 'complex';
  }

  return 'standard';
}

/**
 * System prompt — 3 tiers matching native platform efficiency.
 *
 *  TIER 1 (simple):   ~15-25 tokens  — greetings, acknowledgments
 *  TIER 2 (standard): ~40-80 tokens  — normal questions
 *  TIER 3 (complex):  ~80-140 tokens — complex queries, think mode, search
 *
 * Comparison: ChatGPT ~100-200 tokens, Claude.ai ~150-300 tokens.
 * Old ConvoiaAI prompt was ~720 tokens — 3-7x more than native platforms.
 * Models already know how to format and behave; we only need identity + one nudge.
 */
export function getSystemPrompt(
  industry?: string,
  provider?: string,
  mode?: 'standard' | 'think' | 'search' | 'conversational' | 'technical' | 'analytical',
  modelId?: string,
  complexity?: 'simple' | 'standard' | 'complex'
): string {
  const providerPersonality = PROVIDER_PERSONALITIES[provider || ''] || 'You are ConvoiaAI.';

  const modelIdLower = (modelId || '').toLowerCase();
  const modelKey = Object.keys(MODEL_PERSONALITY_OVERRIDES)
    .sort((a, b) => b.length - a.length)
    .find(k => modelIdLower.includes(k)) || '';
  const modelOverride = MODEL_PERSONALITY_OVERRIDES[modelKey] || '';

  const industrySnippets: Record<string, string> = {
    legal: ' Legal domain — be precise, note when professional counsel is recommended.',
    healthcare: ' Healthcare domain — evidence-based, recommend consulting professionals.',
    finance: ' Finance domain — data-driven, distinguish education from personalized advice.',
    hr: ' HR domain — professional, inclusive, compliant.',
    marketing: ' Marketing domain — creative and data-driven, focus on ROI.',
    education: ' Education domain — adapt to learner level, use analogies.',
    technology: ' Technology domain — practical, production-ready solutions.',
    ecommerce: ' E-commerce domain — conversion optimization, customer experience.',
  };
  const industryCtx = industrySnippets[industry || ''] || '';

  // TIER 1 — simple greetings (~15-25 tokens)
  if (complexity === 'simple' && mode !== 'think' && mode !== 'search') {
    return `${providerPersonality} Be natural and brief.`;
  }

  // TIER 2 — search (~60-100 tokens)
  if (mode === 'search') {
    return `${providerPersonality}${modelOverride} You have fresh web search data — cite sources inline ("According to **Source**..."), bold key facts, be accurate and thorough.${industryCtx}`;
  }

  // TIER 3 — think mode (~100-160 tokens)
  if (mode === 'think') {
    return `${providerPersonality}${modelOverride} DEEP THINK MODE — expert-level analysis. Go deeper than a standard response — show reasoning, not just conclusions. Address edge cases and trade-offs. If multiple approaches exist, evaluate them. Be precise — never fabricate. For code: production-ready and complete. For comparisons: use tables. Use **bold** for key takeaways, ## headers for sections. Never show internal monologue or planning — go straight to the deliverable. Always deliver the COMPLETE response — never cut short.${industryCtx}`;
  }

  // TIER 2 — standard (~60-100 tokens)
  if (complexity !== 'complex') {
    return `${providerPersonality}${modelOverride} Be direct — lead with the answer. Be specific and actionable. Never show your thinking process or internal reasoning — go straight to the deliverable. For code: complete and production-ready. For comparisons: use a table. Complete every task fully — never stop mid-response.${industryCtx}`;
  }

  // TIER 3 — complex standard (~100-160 tokens)
  return `${providerPersonality}${modelOverride} Be direct and thorough — deliver the complete output without preamble, internal reasoning, or meta-commentary about your process. Never say "let me think" or explain your approach — just produce the deliverable. For code: production-ready with error handling. For comparisons: use tables. Use **bold** for takeaways, ## headers for long responses. Keep paragraphs short. Always complete the full task — never stop partway through.${industryCtx}`;
}

function calculateCosts(inputTokens: number, outputTokens: number, aiModel: any) {
  const providerCost =
    inputTokens * aiModel.inputTokenPrice +
    outputTokens * aiModel.outputTokenPrice;
  const customerPrice = providerCost * (1 + aiModel.markupPercentage / 100);
  const profit = customerPrice - providerCost;
  return { providerCost, customerPrice, profit };
}

// ─── Provider output limits (hard caps set by each API) ───
const PROVIDER_MAX_OUTPUT: Record<string, number> = {
  openai: 16384,
  anthropic: 16384,
  google: 16384,
  deepseek: 16384,
  mistral: 16384,
  groq: 16384,
  xai: 32768,
  perplexity: 16384,
};

function clampMaxTokens(provider: string, requested?: number): number {
  const providerMax = PROVIDER_MAX_OUTPUT[provider] ?? 8192;
  if (!requested || requested <= 0) return providerMax;
  return Math.min(requested, providerMax);
}

// ─── Text-only provider calls ───

interface ProviderOverrides {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  thinkingEnabled?: boolean;
}

// PURE reasoning models (o1/o3/o4-mini) — reject temperature, top_p; require 'developer' role
const isPureReasoningModel = (id: string) => /^o\d/.test(id);

// GPT-5 family — unified models with optional reasoning via reasoning.effort.
// They use max_completion_tokens but DO accept temperature and 'system' role.
const isGPT5Family = (id: string) => /^gpt-5/.test(id);

// ── Temperature-locked models ────────────────────────────────────────
// Some models (Claude Opus 4.6/Sonnet 4.6, GPT-5, etc.) only accept temperature=1.
// Instead of maintaining a brittle allowlist, safeProviderCall() catches the error
// and auto-populates this cache. Streaming calls check the cache before sending.
const TEMP_LOCKED_MODELS = new Set<string>();

// Seed the cache with known models that require temperature=1
[
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-5-20250929',
  'gpt-5',
  'gpt-5-mini',
].forEach(m => TEMP_LOCKED_MODELS.add(m));

logger.info(`Temperature-locked models (seed): ${[...TEMP_LOCKED_MODELS].join(', ')}`);

/**
 * Wraps a provider API call. If the provider rejects the temperature setting,
 * logs a warning, adds the model to TEMP_LOCKED_MODELS, and retries with temperature=1.
 * This handles providers that ship new models with temperature=1-only restrictions.
 */
async function safeProviderCall<T>(
  callFn: () => Promise<T>,
  retryFn: () => Promise<T>,
  modelId: string
): Promise<T> {
  try {
    return await callFn();
  } catch (error: any) {
    const errMsg = (error?.response?.data?.error?.message || error?.message || '').toLowerCase();
    // Detect temperature rejection from any provider
    if (
      errMsg.includes('temperature') &&
      (errMsg.includes('unsupported') || errMsg.includes('does not support') ||
       errMsg.includes('invalid') || errMsg.includes('only the default'))
    ) {
      logger.warn(`Model ${modelId} rejected temperature — adding to TEMP_LOCKED_MODELS and retrying with temperature=1`);
      TEMP_LOCKED_MODELS.add(modelId);
      logger.info(`TEMP_LOCKED_MODELS updated: ${[...TEMP_LOCKED_MODELS].join(', ')}`);
      return await retryFn();
    }
    throw error;
  }
}

async function callOpenAI(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const pureReasoning = isPureReasoningModel(modelId);
  const gpt5 = isGPT5Family(modelId);
  const systemRole = pureReasoning ? 'developer' : 'system';

  const buildBody = (forceTemp1: boolean = false): Record<string, any> => {
    const body: Record<string, any> = {
      model: modelId,
      messages: [{ role: systemRole, content: systemPrompt }, ...messages],
    };

    if (pureReasoning) {
      body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    } else if (gpt5) {
      body.max_completion_tokens = overrides?.maxTokens ?? 16384;
      body.temperature = forceTemp1 ? 1 : (overrides?.temperature ?? 0.7);
      if (!forceTemp1 && overrides?.topP != null) body.top_p = overrides.topP;
    } else {
      body.max_tokens = overrides?.maxTokens ?? 16384;
      body.temperature = forceTemp1 ? 1 : (overrides?.temperature ?? 0.7);
      if (!forceTemp1 && overrides?.topP != null) body.top_p = overrides.topP;
    }
    return body;
  };

  const makeCall = async (body: Record<string, any>) => {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      body,
      axiosConfig({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })
    );
    return {
      response: response.data.choices[0].message.content,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  };

  return safeProviderCall(
    () => makeCall(buildBody(false)),
    () => makeCall(buildBody(true)),
    modelId
  );
}

async function callAnthropic(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const buildBody = (forceTemp1: boolean = false): { body: Record<string, any>; headers: Record<string, string> } => {
    const body: Record<string, any> = {
      model: modelId,
      max_tokens: overrides?.maxTokens ?? 16384,
      system: systemPrompt,
      messages,
    };

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };

    if (overrides?.thinkingEnabled) {
      body.thinking = { type: 'enabled', budget_tokens: 10000 };
      body.max_tokens = Math.max(body.max_tokens, 32000);
      body.temperature = 1; // REQUIRED by Anthropic when thinking is enabled
      headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
    } else if (forceTemp1) {
      body.temperature = 1;
    } else {
      // Anthropic rejects both temperature AND top_p together — use only one
      if (overrides?.temperature != null) {
        body.temperature = overrides.temperature;
      } else if (overrides?.topP != null) {
        body.top_p = overrides.topP;
      } else {
        body.temperature = 0.7;
      }
    }
    return { body, headers };
  };

  const makeCall = async (forceTemp1: boolean) => {
    const { body, headers } = buildBody(forceTemp1);
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      body,
      axiosConfig(headers)
    );
    // Extract text from response — thinking mode returns multiple content blocks
    const textContent = response.data.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    return {
      response: textContent || response.data.content[0]?.text || '',
      inputTokens: response.data.usage.input_tokens,
      outputTokens: response.data.usage.output_tokens,
    };
  };

  return safeProviderCall(
    () => makeCall(false),
    () => makeCall(true),
    modelId
  );
}

async function callGoogle(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: formatPartsForGoogle(m.content),
  }));

  const makeCall = async (forceTemp1: boolean) => {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
      {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: forceTemp1 ? 1 : (overrides?.temperature ?? 0.7),
          maxOutputTokens: overrides?.maxTokens ?? 16384,
          ...(!forceTemp1 && overrides?.topP != null ? { topP: overrides.topP } : {}),
        },
      },
      {
        params: { key: apiKey },
        timeout: config.aiRequestTimeout,
      }
    );
    return {
      response: response.data.candidates[0].content.parts[0].text,
      inputTokens: response.data.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.data.usageMetadata?.candidatesTokenCount || 0,
    };
  };

  return safeProviderCall(() => makeCall(false), () => makeCall(true), modelId);
}

// ── Google Gemini real SSE streaming ──
// Gemini exposes a streamGenerateContent endpoint. The response comes
// as an SSE stream of `data: { candidates: [...] }` frames. If the
// streaming endpoint fails for any reason (unsupported model version,
// transient upstream error), we fall back to the non-streaming
// callGoogle() and emit the full response as a single chunk so the
// user still gets a response.
function callGoogleStream(
  modelId: string,
  messages: any[],
  systemPrompt: string,
  apiKey: string,
  callbacks: StreamCallbacks,
  overrides?: ProviderOverrides,
): Promise<void> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: formatPartsForGoogle(m.content),
  }));

  const effectiveTemp = TEMP_LOCKED_MODELS.has(modelId)
    ? 1
    : (overrides?.temperature ?? 0.7);

  const body: Record<string, any> = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: effectiveTemp,
      maxOutputTokens: overrides?.maxTokens ?? 16384,
      ...(effectiveTemp !== 1 && overrides?.topP != null ? { topP: overrides.topP } : {}),
    },
  };

  return new Promise(async (resolve, reject) => {
    let streamingFailed = false;
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`,
        body,
        {
          params: { key: apiKey, alt: 'sse' },
          timeout: config.aiRequestTimeout,
          responseType: 'stream',
        }
      );

      let inputTokens = 0;
      let outputTokens = 0;
      let buffer = '';
      let gotAnyChunk = false;

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              gotAnyChunk = true;
              callbacks.onChunk(text);
            }
            if (json?.usageMetadata) {
              inputTokens = json.usageMetadata.promptTokenCount || inputTokens;
              outputTokens = json.usageMetadata.candidatesTokenCount || outputTokens;
            }
          } catch { /* skip malformed SSE frame */ }
        }
      });

      response.data.on('end', () => {
        if (!gotAnyChunk) {
          // Empty stream — treat as failure so we fall back below.
          streamingFailed = true;
          return;
        }
        callbacks.onDone(inputTokens, outputTokens);
        resolve();
      });

      response.data.on('error', (err: Error) => {
        logger.warn(`Gemini stream transport error for ${modelId}: ${err.message}`);
        streamingFailed = true;
      });

      // Wait a tick for 'end' to potentially fire before checking the flag.
      response.data.on('close', async () => {
        if (!streamingFailed) return;
        try {
          logger.warn(`Gemini streaming produced no chunks for ${modelId}; falling back to non-streaming`);
          const result = await callGoogle(modelId, messages, systemPrompt, apiKey, overrides);
          if (result.response) callbacks.onChunk(result.response);
          callbacks.onDone(result.inputTokens, result.outputTokens);
          resolve();
        } catch (fallbackErr: any) {
          callbacks.onError(fallbackErr);
          reject(fallbackErr);
        }
      });
    } catch (err: any) {
      // Streaming endpoint returned an HTTP error before any data.
      logger.warn(`Gemini streaming failed for ${modelId}: ${err?.message}; falling back to non-streaming`);
      try {
        const result = await callGoogle(modelId, messages, systemPrompt, apiKey, overrides);
        if (result.response) callbacks.onChunk(result.response);
        callbacks.onDone(result.inputTokens, result.outputTokens);
        resolve();
      } catch (fallbackErr: any) {
        callbacks.onError(fallbackErr);
        reject(fallbackErr);
      }
    }
  });
}

async function callGroq(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const buildBody = (forceTemp1: boolean): Record<string, any> => {
    const body: Record<string, any> = {
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: forceTemp1 ? 1 : (overrides?.temperature ?? 0.7),
      max_tokens: overrides?.maxTokens ?? 16384,
    };
    if (!forceTemp1 && overrides?.topP != null) body.top_p = overrides.topP;
    return body;
  };

  const makeCall = async (forceTemp1: boolean) => {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      buildBody(forceTemp1),
      axiosConfig({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })
    );
    return {
      response: response.data.choices[0].message.content,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  };

  return safeProviderCall(() => makeCall(false), () => makeCall(true), modelId);
}

async function callMistral(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const buildBody = (forceTemp1: boolean): Record<string, any> => {
    const body: Record<string, any> = {
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: forceTemp1 ? 1 : (overrides?.temperature ?? 0.7),
      max_tokens: overrides?.maxTokens ?? 16384,
    };
    if (!forceTemp1 && overrides?.topP != null) body.top_p = overrides.topP;
    return body;
  };

  const makeCall = async (forceTemp1: boolean) => {
    const response = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      buildBody(forceTemp1),
      axiosConfig({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })
    );
    return {
      response: response.data.choices[0].message.content,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  };

  return safeProviderCall(() => makeCall(false), () => makeCall(true), modelId);
}

async function callPerplexity(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  // Perplexity requires strict user/assistant alternation
  const alternating = mergeConsecutiveMessages(messages);
  if (alternating.length > 0 && alternating[0].role !== 'user') {
    alternating.unshift({ role: 'user', content: 'Continue.' });
  }

  const buildBody = (forceTemp1: boolean): Record<string, any> => ({
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...alternating],
    temperature: forceTemp1 ? 1 : (overrides?.temperature ?? 0.2),
  });

  const makeCall = async (forceTemp1: boolean) => {
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      buildBody(forceTemp1),
      axiosConfig({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })
    );
    let text = response.data.choices[0].message.content;
    const citations = response.data.citations;
    if (citations && Array.isArray(citations) && citations.length > 0) {
      text += '\n\n---\n**Sources:**\n' + citations.map((url: string, i: number) => `${i + 1}. ${url}`).join('\n');
    }
    return {
      response: text,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  };

  return safeProviderCall(() => makeCall(false), () => makeCall(true), modelId);
}

async function callXAI(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const buildBody = (forceTemp1: boolean): Record<string, any> => {
    const body: Record<string, any> = {
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: forceTemp1 ? 1 : (overrides?.temperature ?? 0.7),
      max_tokens: overrides?.maxTokens ?? 16384,
    };
    if (!forceTemp1 && overrides?.topP != null) body.top_p = overrides.topP;
    return body;
  };

  const makeCall = async (forceTemp1: boolean) => {
    const response = await axios.post(
      'https://api.x.ai/v1/chat/completions',
      buildBody(forceTemp1),
      axiosConfig({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })
    );
    return {
      response: response.data.choices[0].message.content,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  };

  return safeProviderCall(() => makeCall(false), () => makeCall(true), modelId);
}

async function callDeepSeek(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const isReasoner = modelId === 'deepseek-reasoner';

  const buildBody = (forceTemp1: boolean): Record<string, any> => {
    const body: Record<string, any> = {
      model: modelId,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: overrides?.maxTokens ?? 16384,
    };
    // DeepSeek Reasoner does NOT support temperature or top_p
    if (!isReasoner) {
      body.temperature = forceTemp1 ? 1 : (overrides?.temperature ?? 0.7);
      if (!forceTemp1 && overrides?.topP != null) body.top_p = overrides.topP;
    }
    return body;
  };

  const makeCall = async (forceTemp1: boolean) => {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      buildBody(forceTemp1),
      axiosConfig({ Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' })
    );
    return {
      response: response.data.choices[0].message.content,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  };

  return safeProviderCall(() => makeCall(false), () => makeCall(true), modelId);
}

// ─── Vision-capable provider calls ───

async function callOpenAIVision(modelId: string, prompt: string, imageBase64: string, mimeType: string, apiKey: string, maxTokens?: number) {
  const tokenLimit = maxTokens ?? 16384;
  const body: Record<string, any> = {
    model: modelId,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'auto' } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };

  // GPT-5 family and pure reasoning models use max_completion_tokens
  if (isPureReasoningModel(modelId) || isGPT5Family(modelId)) {
    body.max_completion_tokens = tokenLimit;
  } else {
    body.max_tokens = tokenLimit;
  }

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    body,
    axiosConfig({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    })
  );
  return {
    response: response.data.choices[0].message.content,
    inputTokens: response.data.usage.prompt_tokens,
    outputTokens: response.data.usage.completion_tokens,
  };
}

async function callAnthropicVision(modelId: string, prompt: string, imageBase64: string, mimeType: string, apiKey: string, maxTokens?: number) {
  // Anthropic vision uses content blocks with image type
  const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: modelId,
      max_tokens: maxTokens ?? 16384,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
    axiosConfig({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    })
  );
  return {
    response: response.data.content[0].text,
    inputTokens: response.data.usage.input_tokens,
    outputTokens: response.data.usage.output_tokens,
  };
}

async function callGoogleVision(modelId: string, prompt: string, imageBase64: string, mimeType: string, apiKey: string, maxTokens?: number) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens ?? 16384 },
    },
    {
      params: { key: apiKey },
      timeout: config.aiRequestTimeout,
    }
  );
  return {
    response: response.data.candidates[0].content.parts[0].text,
    inputTokens: response.data.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.data.usageMetadata?.candidatesTokenCount || 0,
  };
}

// ─── Routing ───

async function routeToProvider(aiModel: any, rawMessages: any[], systemPrompt: string, overrides?: ProviderOverrides) {
  const { provider, modelId } = aiModel;

  // Move any 'system' role messages (document/file context) into the last user message
  const sysMsgs = rawMessages.filter((m: any) => m.role === 'system');
  let messages = rawMessages.filter((m: any) => m.role !== 'system');
  if (sysMsgs.length > 0) {
    const docCtx = sysMsgs.map((m: any) => typeof m.content === 'string' ? m.content : '').join('\n\n---\n\n');
    let lastIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastIdx = i; break; }
    }
    if (lastIdx >= 0) {
      const existing = messages[lastIdx].content;
      if (typeof existing === 'string') {
        messages[lastIdx] = { ...messages[lastIdx], content: docCtx + '\n\n---\n\nUser question: ' + existing };
      } else if (Array.isArray(existing)) {
        messages[lastIdx] = { ...messages[lastIdx], content: [{ type: 'text', text: docCtx + '\n\n---\n\nUser question: ' }, ...existing] };
      }
    } else {
      messages.push({ role: 'user', content: docCtx });
    }
  }

  const apiKey = config.apiKeys[provider as keyof typeof config.apiKeys];
  if (!apiKey) {
    throw new AppError(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} is not available — API key not configured. Please select a different model.`,
      503
    );
  }

  switch (provider) {
    case 'openai':
      return await callOpenAI(modelId, formatMessagesForOpenAI(messages), systemPrompt, apiKey, overrides);

    case 'anthropic':
      return await callAnthropic(modelId, formatMessagesForAnthropic(messages), systemPrompt, apiKey, overrides);

    case 'google':
      return await callGoogle(modelId, messages, systemPrompt, apiKey, overrides);

    case 'groq':
      return await callGroq(modelId, formatMessagesForOpenAI(messages), systemPrompt, apiKey, overrides);

    case 'mistral':
      return await callMistral(modelId, formatMessagesForOpenAI(messages), systemPrompt, apiKey, overrides);

    case 'deepseek':
      return await callDeepSeek(modelId, formatMessagesForOpenAI(messages), systemPrompt, apiKey, overrides);

    case 'perplexity':
      return await callPerplexity(modelId, formatMessagesForOpenAI(messages), systemPrompt, apiKey, overrides);

    case 'xai':
      return await callXAI(modelId, formatMessagesForOpenAI(messages), systemPrompt, apiKey, overrides);

    default:
      throw new AppError(`Unsupported provider: ${provider}`, 400);
  }
}

async function routeVisionToProvider(aiModel: any, prompt: string, imageBase64: string, mimeType: string, maxTokens?: number) {
  const { provider, modelId } = aiModel;

  const apiKey = config.apiKeys[provider as keyof typeof config.apiKeys];

  switch (provider) {
    case 'openai':
      if (!apiKey) throw new AppError('OpenAI is not available — API key not configured.', 503);
      return await callOpenAIVision(modelId, prompt, imageBase64, mimeType, apiKey, maxTokens);

    case 'anthropic':
      if (!apiKey) throw new AppError('Anthropic is not available — API key not configured.', 503);
      return await callAnthropicVision(modelId, prompt, imageBase64, mimeType, apiKey, maxTokens);

    case 'google':
      if (!apiKey) throw new AppError('Google is not available — API key not configured.', 503);
      return await callGoogleVision(modelId, prompt, imageBase64, mimeType, apiKey, maxTokens);

    default:
      // Groq, Mistral, DeepSeek don't have vision — find best available vision model
      return null;
  }
}

// Providers that support vision natively
const VISION_PROVIDERS = ['openai', 'anthropic', 'google'];

// Find the best available fallback model from a different provider
async function findFallbackModel(excludeProvider: string) {
  // Priority order: try providers we have keys for, cheapest first
  const availableProviders = Object.entries(config.apiKeys)
    .filter(([p, key]) => p !== excludeProvider && !!key)
    .map(([p]) => p);

  if (availableProviders.length === 0) return null;

  return prisma.aIModel.findFirst({
    where: {
      isActive: true,
      provider: { in: availableProviders },
    },
    orderBy: { inputTokenPrice: 'asc' },
  });
}

// ─── Streaming provider calls (SSE) ───

interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (inputTokens: number, outputTokens: number) => void;
  onError: (error: Error) => void;
}

function callOpenAIStream(
  modelId: string, messages: any[], systemPrompt: string,
  apiKey: string, callbacks: StreamCallbacks, overrides?: ProviderOverrides
): Promise<void> {
  const pureReasoning = isPureReasoningModel(modelId);
  const gpt5 = isGPT5Family(modelId);
  const systemRole = pureReasoning ? 'developer' : 'system';
  const thinkingEnabled = !!overrides?.thinkingEnabled;
  const formattedMsgs = formatMessagesForOpenAI(messages);

  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: systemRole, content: systemPrompt }, ...formattedMsgs],
    stream: true,
    stream_options: { include_usage: true },
  };

  if (pureReasoning) {
    // o-series: only max_completion_tokens, no temperature/top_p
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    if (thinkingEnabled) {
      body.max_completion_tokens = Math.max(body.max_completion_tokens, 32768);
    }
  } else if (gpt5) {
    // GPT-5 family: max_completion_tokens + temperature
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
    if (thinkingEnabled) {
      body.max_completion_tokens = Math.max(body.max_completion_tokens, 32768);
    }
  } else {
    // Legacy models (GPT-4o, GPT-4.1, etc.)
    body.max_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  }

  // If this model is known to reject custom temperature, force temperature=1
  if (TEMP_LOCKED_MODELS.has(modelId) && body.temperature !== undefined) {
    body.temperature = 1;
    delete body.top_p;
  }

  // For OpenAI models with thinking enabled: use structured prompt with <think> tags
  if (thinkingEnabled) {
    body.max_completion_tokens = Math.max(body.max_completion_tokens || body.max_tokens || 16384, 32768);
    const thinkPrompt = `You MUST structure your response in two parts:

PART 1 — THINKING: Start with <think> tag. Show your detailed step-by-step reasoning, analysis, and thought process inside this block. Consider multiple angles, evaluate trade-offs, and work through the problem methodically. End with </think> tag.

PART 2 — ANSWER: After </think>, provide your clear, concise final answer.

Example format:
<think>
Let me analyze this step by step...
1. First consideration...
2. Second consideration...
3. Therefore...
</think>

[Your clear final answer here]

${systemPrompt}`;
    body.messages[0].content = thinkPrompt;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        body,
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: config.aiRequestTimeout,
          responseType: 'stream',
        }
      );

      let inputTokens = 0, outputTokens = 0;
      let buffer = '';
      let isThinking = false;
      let contentBuffer = ''; // Buffer to detect <think> tags

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;

            if (delta?.content) {
              let text = delta.content;

              // Parse <think> tags
              if (thinkingEnabled) {
                contentBuffer += text;

                // Detect <think> opening
                if (!isThinking && contentBuffer.includes('<think>')) {
                  isThinking = true;
                  const afterTag = contentBuffer.split('<think>').pop() || '';
                  callbacks.onChunk('\n> 🧠 **Thinking...**\n>\n> ');
                  if (afterTag) {
                    callbacks.onChunk(afterTag.replace(/\n/g, '\n> '));
                  }
                  contentBuffer = '';
                  continue;
                }

                // Detect </think> closing
                if (isThinking && contentBuffer.includes('</think>')) {
                  const beforeTag = contentBuffer.split('</think>')[0];
                  if (beforeTag) {
                    callbacks.onChunk(beforeTag.replace(/\n/g, '\n> '));
                  }
                  isThinking = false;
                  callbacks.onChunk('\n\n---\n\n**Answer:**\n\n');
                  const afterTag = contentBuffer.split('</think>').slice(1).join('');
                  if (afterTag) callbacks.onChunk(afterTag);
                  contentBuffer = '';
                  continue;
                }

                // Stream thinking content as blockquote
                if (isThinking) {
                  // Only flush if buffer is long enough (avoid partial tag detection)
                  if (contentBuffer.length > 10) {
                    const toFlush = contentBuffer.slice(0, -8); // Keep last 8 chars for tag detection
                    contentBuffer = contentBuffer.slice(-8);
                    callbacks.onChunk(toFlush.replace(/\n/g, '\n> '));
                  }
                  continue;
                }

                // Regular content (not in thinking mode)
                if (contentBuffer.length > 10) {
                  const toFlush = contentBuffer.slice(0, -8);
                  contentBuffer = contentBuffer.slice(-8);
                  callbacks.onChunk(toFlush);
                }
                continue;
              }

              // No thinking mode — pass through directly
              callbacks.onChunk(text);
            }

            if (json.usage) {
              inputTokens = json.usage.prompt_tokens || 0;
              outputTokens = json.usage.completion_tokens || 0;
            }
          } catch { /* skip malformed chunks */ }
        }
      });

      response.data.on('end', () => {
        // Flush remaining content buffer
        if (contentBuffer) {
          if (isThinking) {
            callbacks.onChunk(contentBuffer.replace(/\n/g, '\n> '));
            callbacks.onChunk('\n\n---\n\n**Answer:**\n\n');
          } else {
            // Clean up any remaining tags
            const cleaned = contentBuffer.replace(/<\/?think>/g, '');
            if (cleaned) callbacks.onChunk(cleaned);
          }
        }
        callbacks.onDone(inputTokens, outputTokens);
        resolve();
      });
      response.data.on('error', (err: Error) => {
        callbacks.onError(err);
        reject(err);
      });
    } catch (err: any) {
      // Log actual OpenAI error — response.data is a stream, read it safely
      let errMsg = err.message || 'Unknown error';
      try {
        if (err.response?.data) {
          let body = '';
          for await (const chunk of err.response.data) body += String(chunk);
          errMsg = body || errMsg;
        }
      } catch { /* ignore read errors */ }
      logger.error('Stream error', {
        message: errMsg,
        provider: 'openai',
        modelId,
        status: err?.response?.status,
        errorBody: errMsg,
        sentBody: typeof err?.config?.data === 'string' ? err.config.data.slice(0, 800) : undefined,
      });
      callbacks.onError(new Error(errMsg));
      reject(new Error(errMsg));
    }
  });
}

function callAnthropicStream(
  modelId: string, messages: any[], systemPrompt: string,
  apiKey: string, callbacks: StreamCallbacks, overrides?: ProviderOverrides
): Promise<void> {
  const formattedMsgs = formatMessagesForAnthropic(messages);
  const body: Record<string, any> = {
    model: modelId,
    max_tokens: overrides?.maxTokens ?? 16384,
    system: systemPrompt,
    messages: formattedMsgs,
    stream: true,
  };

  // Extended thinking mode (Claude only)
  if (overrides?.thinkingEnabled) {
    body.thinking = { type: 'enabled', budget_tokens: 10000 };
    // Extended thinking requires higher max_tokens (must be > budget_tokens)
    body.max_tokens = Math.max(body.max_tokens, 32000);
    body.temperature = 1; // REQUIRED by Anthropic when thinking is enabled
    delete body.top_p;    // Anthropic rejects both temperature AND top_p together
  } else {
    // Anthropic rejects requests with BOTH temperature AND top_p — use only one
    if (overrides?.temperature != null) {
      body.temperature = overrides.temperature;
    } else if (overrides?.topP != null) {
      body.top_p = overrides.topP;
    } else {
      body.temperature = 0.7;
    }
  }

  // If this model is known to reject custom temperature, force temperature=1
  if (TEMP_LOCKED_MODELS.has(modelId) && !overrides?.thinkingEnabled) {
    body.temperature = 1;
    delete body.top_p;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const headers: Record<string, string> = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      };
      // Extended thinking requires beta header
      if (overrides?.thinkingEnabled) {
        headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
      }

      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        body,
        {
          headers,
          timeout: config.aiRequestTimeout,
          responseType: 'stream',
        }
      );

      let inputTokens = 0, outputTokens = 0;
      let buffer = '';
      let currentBlockType = 'text'; // Track whether current block is 'thinking' or 'text'
      let isThinking = false;

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));

            // Track content block type (thinking vs text)
            if (json.type === 'content_block_start') {
              currentBlockType = json.content_block?.type || 'text';
              if (currentBlockType === 'thinking' && !isThinking) {
                isThinking = true;
                callbacks.onChunk('\n> 🧠 **Thinking...**\n>\n> ');
              }
            }
            if (json.type === 'content_block_stop' && currentBlockType === 'thinking') {
              callbacks.onChunk('\n\n---\n\n**Answer:**\n\n');
              currentBlockType = 'text';
            }

            // Stream text deltas
            if (json.type === 'content_block_delta') {
              if (json.delta?.type === 'thinking_delta' && json.delta?.thinking) {
                // Stream thinking text with blockquote formatting
                const thinkText = json.delta.thinking.replace(/\n/g, '\n> ');
                callbacks.onChunk(thinkText);
              } else if (json.delta?.text) {
                callbacks.onChunk(json.delta.text);
              }
            }

            if (json.type === 'message_start' && json.message?.usage) {
              inputTokens = json.message.usage.input_tokens || 0;
            }
            if (json.type === 'message_delta' && json.usage) {
              outputTokens = json.usage.output_tokens || 0;
            }
          } catch { /* skip */ }
        }
      });

      response.data.on('end', () => {
        callbacks.onDone(inputTokens, outputTokens);
        resolve();
      });
      response.data.on('error', (err: Error) => {
        callbacks.onError(err);
        reject(err);
      });
    } catch (err: any) {
      const status = err?.response?.status;
      logger.error('Anthropic stream error', {
        provider: 'anthropic', modelId, status,
        message: err?.response?.data?.error?.message || err?.message,
        ...(status === 403 ? { hint: 'Check ANTHROPIC_API_KEY in .env' } : {}),
      });
      callbacks.onError(err);
      reject(err);
    }
  });
}

// Generic OpenAI-compatible streaming (Groq, Mistral, DeepSeek, xAI)
// supportsStreamOptions: only OpenAI, Groq, DeepSeek support stream_options.
// xAI and Mistral reject it with 400 — must be omitted for them.
function callOpenAICompatibleStream(
  url: string, modelId: string, messages: any[], systemPrompt: string,
  apiKey: string, callbacks: StreamCallbacks, overrides?: ProviderOverrides,
  supportsStreamOptions: boolean = false
): Promise<void> {
  const isDeepSeekReasoner = modelId === 'deepseek-reasoner';
  const formattedMsgs = formatMessagesForOpenAI(messages);

  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...formattedMsgs],
    stream: true,
    ...(supportsStreamOptions ? { stream_options: { include_usage: true } } : {}),
  };

  // DeepSeek Reasoner doesn't support temperature/top_p
  if (!isDeepSeekReasoner) {
    body.temperature = overrides?.temperature ?? 0.7;
    body.max_tokens = overrides?.maxTokens ?? 16384;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  } else {
    body.max_tokens = overrides?.maxTokens ?? 16384;
  }

  // If this model is known to reject custom temperature, force temperature=1
  if (TEMP_LOCKED_MODELS.has(modelId) && body.temperature !== undefined) {
    body.temperature = 1;
    delete body.top_p;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: config.aiRequestTimeout,
        responseType: 'stream',
      });

      let inputTokens = 0, outputTokens = 0;
      let buffer = '';
      let isThinking = false;

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;

            // DeepSeek Reasoner: stream reasoning_content as thinking blocks
            if (delta?.reasoning_content) {
              if (!isThinking) {
                isThinking = true;
                callbacks.onChunk('\n> 🧠 **Thinking...**\n>\n> ');
              }
              const thinkText = delta.reasoning_content.replace(/\n/g, '\n> ');
              callbacks.onChunk(thinkText);
            }

            // Regular content — if we were thinking, close the block first
            if (delta?.content) {
              if (isThinking) {
                isThinking = false;
                callbacks.onChunk('\n\n---\n\n**Answer:**\n\n');
              }
              callbacks.onChunk(delta.content);
            }

            if (json.usage) {
              inputTokens = json.usage.prompt_tokens || 0;
              outputTokens = json.usage.completion_tokens || 0;
            }
          } catch { /* skip */ }
        }
      });

      response.data.on('end', () => {
        callbacks.onDone(inputTokens, outputTokens);
        resolve();
      });
      response.data.on('error', (err: Error) => {
        callbacks.onError(err);
        reject(err);
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const provider = url.includes('groq') ? 'groq' : url.includes('mistral') ? 'mistral' : url.includes('deepseek') ? 'deepseek' : url.includes('x.ai') ? 'xai' : 'unknown';
      logger.error('Compatible stream error', {
        provider, modelId, status,
        message: err?.response?.data?.error?.message || err?.message,
        ...(status === 403 ? { hint: `Check ${provider.toUpperCase()}_API_KEY in .env` } : {}),
      });
      callbacks.onError(err);
      reject(err);
    }
  });
}

// Merge consecutive same-role messages (Perplexity requires strict alternation)
function mergeConsecutiveMessages(msgs: any[]): any[] {
  const merged: any[] = [];
  for (const msg of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      // Merge content into previous message of same role
      const lastText = typeof last.content === 'string' ? last.content : '';
      const thisText = typeof msg.content === 'string' ? msg.content : '';
      last.content = lastText + '\n\n' + thisText;
    } else {
      merged.push({ ...msg });
    }
  }
  return merged;
}

// Perplexity-specific streaming with citation support
function callPerplexityStream(
  modelId: string, messages: any[], systemPrompt: string,
  apiKey: string, callbacks: StreamCallbacks, overrides?: ProviderOverrides
): Promise<void> {
  const formattedMsgs = formatMessagesForOpenAI(messages);

  // Perplexity requires strict user/assistant alternation after system message
  const alternating = mergeConsecutiveMessages(formattedMsgs);
  // Ensure conversation starts with user message (after system)
  if (alternating.length > 0 && alternating[0].role !== 'user') {
    alternating.unshift({ role: 'user', content: 'Continue.' });
  }

  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...alternating],
    stream: true,
    temperature: overrides?.temperature ?? 0.2,
  };

  // If this model is known to reject custom temperature, force temperature=1
  if (TEMP_LOCKED_MODELS.has(modelId) && body.temperature !== undefined) {
    body.temperature = 1;
  }

  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        body,
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: config.aiRequestTimeout,
          responseType: 'stream',
        }
      );

      let inputTokens = 0, outputTokens = 0;
      let buffer = '';
      let citations: string[] = [];
      // Buffer-safe <think>...</think> stripping. The old code used
      // text.includes('<think>') on a per-chunk basis, which silently
      // dropped content when a tag was split across SSE chunks (e.g.
      // chunk1 ends with `<thi`, chunk2 starts with `nk>`). We now
      // accumulate content in thinkBuffer until we've either passed
      // the </think> marker or emitted enough safe text.
      let thinkBuffer = '';
      let insideThink = false;
      let thinkDone = false;

      const flushSafe = (s: string) => {
        if (!s) return;
        const cleaned = s.replace(/<\/?think>/g, '');
        if (cleaned) callbacks.onChunk(cleaned);
      };

      response.data.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;

            if (delta?.content) {
              const text: string = delta.content;

              if (thinkDone) {
                // Past the reasoning block — pass through directly.
                flushSafe(text);
              } else {
                thinkBuffer += text;

                // Enter think mode if we see an opening tag.
                if (!insideThink && thinkBuffer.includes('<think>')) {
                  const pre = thinkBuffer.split('<think>')[0];
                  if (pre) flushSafe(pre);
                  insideThink = true;
                  thinkBuffer = thinkBuffer.split('<think>').slice(1).join('<think>');
                }

                if (insideThink) {
                  // Exit think mode once we see the closing tag.
                  if (thinkBuffer.includes('</think>')) {
                    insideThink = false;
                    thinkDone = true;
                    const afterThink = thinkBuffer.split('</think>').slice(1).join('</think>');
                    thinkBuffer = '';
                    if (afterThink) flushSafe(afterThink);
                  } else if (thinkBuffer.length > 50000) {
                    // Safety: never grow the think buffer unbounded.
                    insideThink = false;
                    thinkDone = true;
                    thinkBuffer = '';
                  }
                } else if (!thinkBuffer.startsWith('<') || thinkBuffer.length > 16) {
                  // No opening tag seen and buffer is past the point
                  // where a partial '<think>' could still be forming:
                  // safe to flush.
                  flushSafe(thinkBuffer);
                  thinkBuffer = '';
                  thinkDone = true;
                }
              }
            }

            // Capture citations from Perplexity response
            if (json.citations && Array.isArray(json.citations)) {
              citations = json.citations;
            }

            if (json.usage) {
              inputTokens = json.usage.prompt_tokens || 0;
              outputTokens = json.usage.completion_tokens || 0;
            }
          } catch { /* skip malformed chunks */ }
        }
      });

      response.data.on('end', () => {
        // Flush any residual think buffer — if the stream ended while
        // we were still inside a <think> block, drop it; if it ended
        // before we could decide, treat it as normal content.
        if (!insideThink && thinkBuffer) {
          flushSafe(thinkBuffer);
          thinkBuffer = '';
        }

        // Append citation block before signaling done
        if (citations.length > 0) {
          const citationBlock = '\n\n---\n**Sources:**\n' +
            citations.map((url: string, i: number) => `${i + 1}. ${url}`).join('\n');
          callbacks.onChunk(citationBlock);
        }
        callbacks.onDone(inputTokens, outputTokens);
        resolve();
      });
      response.data.on('error', (err: Error) => {
        callbacks.onError(err);
        reject(err);
      });
    } catch (err: any) {
      const status = err?.response?.status;
      // Read the actual error body from Perplexity (it's a stream on error)
      let errorBody = '';
      try {
        if (err?.response?.data) {
          if (typeof err.response.data === 'string') {
            errorBody = err.response.data;
          } else if (typeof err.response.data.pipe === 'function') {
            for await (const chunk of err.response.data) errorBody += String(chunk);
          } else {
            errorBody = JSON.stringify(err.response.data);
          }
        }
      } catch { /* ignore read errors */ }
      logger.error('Perplexity stream error', {
        provider: 'perplexity', modelId, status,
        message: err?.message,
        errorBody: errorBody.slice(0, 500),
        ...(status === 403 ? { hint: 'Check PERPLEXITY_API_KEY in .env' } : {}),
      });
      callbacks.onError(new Error(errorBody || err?.message || 'Perplexity error'));
      reject(err);
    }
  });
}

async function routeToProviderStream(
  aiModel: any, rawMessages: any[], systemPrompt: string,
  callbacks: StreamCallbacks, overrides?: ProviderOverrides
) {
  const { provider, modelId } = aiModel;
  const contextWindow = MODEL_CONTEXT_WINDOWS[modelId] || 128000;

  // Move any 'system' role messages (document/file context) into the last user message
  // System role is invalid in Anthropic and confusing for other providers
  const systemMsgs = rawMessages.filter((m: any) => m.role === 'system');
  let cleaned = rawMessages.filter((m: any) => m.role !== 'system');
  if (systemMsgs.length > 0) {
    const docContext = systemMsgs.map((m: any) => typeof m.content === 'string' ? m.content : '').join('\n\n---\n\n');
    let lastUserIdx = -1;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx >= 0) {
      const existing = cleaned[lastUserIdx].content;
      if (typeof existing === 'string') {
        cleaned[lastUserIdx] = { ...cleaned[lastUserIdx], content: docContext + '\n\n---\n\nUser question: ' + existing };
      } else if (Array.isArray(existing)) {
        // Multimodal content — prepend doc context as text part
        cleaned[lastUserIdx] = { ...cleaned[lastUserIdx], content: [{ type: 'text', text: docContext + '\n\n---\n\nUser question: ' }, ...existing] };
      }
    } else {
      cleaned.push({ role: 'user', content: docContext });
    }
  }

  const messages = trimToContextWindow(cleaned, contextWindow);

  const apiKey = config.apiKeys[provider as keyof typeof config.apiKeys];
  if (!apiKey) {
    throw new AppError(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} is not available — API key not configured. Please select a different model.`,
      503
    );
  }

  switch (provider) {
    case 'openai':
      return callOpenAIStream(modelId, messages, systemPrompt, apiKey, callbacks, overrides);

    case 'anthropic':
      return callAnthropicStream(modelId, messages, systemPrompt, apiKey, callbacks, overrides);

    case 'groq':
      return callOpenAICompatibleStream(
        'https://api.groq.com/openai/v1/chat/completions',
        modelId, messages, systemPrompt, apiKey, callbacks, overrides,
        true  // Groq supports stream_options
      );

    case 'mistral':
      return callOpenAICompatibleStream(
        'https://api.mistral.ai/v1/chat/completions',
        modelId, messages, systemPrompt, apiKey, callbacks, overrides,
        false  // Mistral does NOT support stream_options → 400
      );

    case 'deepseek':
      return callOpenAICompatibleStream(
        'https://api.deepseek.com/v1/chat/completions',
        modelId, messages, systemPrompt, apiKey, callbacks, overrides,
        true  // DeepSeek supports stream_options
      );

    case 'perplexity':
      return callPerplexityStream(
        modelId, messages, systemPrompt, apiKey, callbacks, overrides
      );

    case 'xai':
      return callOpenAICompatibleStream(
        'https://api.x.ai/v1/chat/completions',
        modelId, messages, systemPrompt, apiKey, callbacks, overrides,
        false  // xAI does NOT support stream_options → 400
      );

    case 'google':
      return callGoogleStream(modelId, messages, systemPrompt, apiKey, callbacks, overrides);

    default:
      throw new AppError(`Unsupported provider for streaming: ${provider}`, 400);
  }
}

export class AIGatewayService {
  // ─── Text message routing ───
  static async sendMessage(params: SendMessageParams): Promise<AIResponse> {
    const { modelId, messages, industry, agentConfig, maxOutputTokens, memoryContext } = params;

    const aiModel = await prisma.aIModel.findUnique({
      where: { id: modelId },
    });

    if (!aiModel) {
      throw new AppError('AI Model not found', 404);
    }

    if (!aiModel.isActive) {
      throw new AppError('This model is currently unavailable', 400);
    }

    // Use agent's system prompt if available, otherwise default (with provider-specific flavor)
    // Append persistent user memory to all prompts
    const basePrompt = agentConfig?.systemPrompt || getSystemPrompt(industry, aiModel.provider, 'standard', aiModel.modelId, params.complexity);
    const systemPrompt = memoryContext ? basePrompt + memoryContext : basePrompt;

    // Determine max output tokens: smallest of agent config, user's balance cap, and provider limit
    let effectiveMaxTokens = agentConfig?.maxTokens;
    if (maxOutputTokens && maxOutputTokens > 0) {
      effectiveMaxTokens = effectiveMaxTokens
        ? Math.min(effectiveMaxTokens, maxOutputTokens)
        : maxOutputTokens;
    }
    // Clamp to provider's hard limit (e.g. Anthropic max 16384)
    effectiveMaxTokens = clampMaxTokens(aiModel.provider, effectiveMaxTokens);

    const overrides: ProviderOverrides | undefined = {
      temperature: agentConfig?.temperature,
      maxTokens: effectiveMaxTokens,
      topP: agentConfig?.topP,
    };
    let result;
    let fallbackUsed = false;
    let fallbackReason;

    try {
      result = await routeToProvider(aiModel, messages, systemPrompt, overrides);
    } catch (error: any) {
      const status = error?.response?.status;
      const errorBody = error?.response?.data;
      logger.error(`Provider error — ${aiModel.provider}/${aiModel.modelId} — HTTP ${status}`, {
        error: errorBody?.error?.message || errorBody?.message || error.message,
        type: errorBody?.error?.type,
      });
      const isRateLimit = status === 429;
      const isProviderDown = status === 503;
      const isModelNotFound = status === 404;
      const isAuthError = status === 401 || status === 403;
      const isTimeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';

      // Auth errors and model-not-found should NOT fallback silently —
      // these indicate config issues that the user/admin needs to fix.
      if (isAuthError) {
        throw new AppError(
          `${aiModel.provider} API key is invalid or missing. Please check your configuration.`,
          401
        );
      }
      if (isModelNotFound) {
        throw new AppError(
          `Model "${aiModel.modelId}" was not found by ${aiModel.provider}. It may be deprecated or the model ID is incorrect.`,
          404
        );
      }

      if (isRateLimit || isProviderDown || isTimeout) {
        fallbackReason = isRateLimit
          ? 'Rate limited'
          : isTimeout
          ? 'Provider timeout'
          : 'Provider unavailable';

        logger.warn(`${fallbackReason} for ${aiModel.provider}, trying fallback`);

        const fallbackModel = await findFallbackModel(aiModel.provider);

        if (!fallbackModel) {
          throw new AppError(`${aiModel.provider} is unavailable (${fallbackReason}) and no other provider is configured.`, 503);
        }

        logger.info(`Falling back to ${fallbackModel.name} (${fallbackModel.provider})`);

        result = await routeToProvider(fallbackModel, messages, systemPrompt, overrides);
        fallbackUsed = true;

        const costs = calculateCosts(result.inputTokens, result.outputTokens, fallbackModel);

        return {
          response: result.response,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.inputTokens + result.outputTokens,
          ...costs,
          markupPercentage: fallbackModel.markupPercentage,
          fallbackUsed: true,
          fallbackReason,
          aiModel: fallbackModel,
        };
      }

      logger.error(`AI Gateway error for ${aiModel.provider}:`, {
        status: error?.response?.status,
        message: error?.response?.data?.error?.message || error.message,
      });
      throw new AppError(
        `AI provider error: ${error?.response?.data?.error?.message || 'Failed to get response'}`,
        error?.response?.status || 500
      );
    }

    const costs = calculateCosts(result.inputTokens, result.outputTokens, aiModel);

    return {
      response: result.response,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      ...costs,
      markupPercentage: aiModel.markupPercentage,
      fallbackUsed,
      aiModel,
    };
  }

  // ─── Streaming text message ───
  static async sendMessageStream(
    params: SendMessageParams,
    callbacks: StreamCallbacks
  ): Promise<{ aiModel: any; overrides?: ProviderOverrides }> {
    const { modelId, messages, industry, agentConfig, maxOutputTokens, memoryContext } = params;

    const aiModel = await prisma.aIModel.findUnique({ where: { id: modelId } });
    if (!aiModel) throw new AppError('AI Model not found', 404);
    if (!aiModel.isActive) throw new AppError('This model is currently unavailable', 400);

    // Web search runs externally in the controller (Perplexity → DDG → Tavily)
    // and injects results into the user message as context. The user's chosen
    // model handles the response — we never swap it out from under them.
    const effectiveModel = aiModel;
    const promptMode = params.webSearchActive ? 'search' : 'standard';

    const basePrompt = agentConfig?.systemPrompt ||
      getSystemPrompt(industry, effectiveModel.provider, promptMode, effectiveModel.modelId, params.complexity);
    const systemPrompt = memoryContext ? basePrompt + memoryContext : basePrompt;

    // ═══ MASTER TOKEN AUDIT ════════════════════════════════════════
    // Breaks down every source of input tokens so we can pinpoint bloat.
    try {
      const _msgChars = messages.reduce((s: number, m: any) => {
        const c = m.content;
        return s + (typeof c === 'string' ? c.length : JSON.stringify(c).length);
      }, 0);
      const _systemChars = systemPrompt?.length || 0;
      const _memoryChars = memoryContext?.length || 0;
      const _agentChars = agentConfig?.systemPrompt?.length || 0;
      const _basePromptChars = basePrompt.length;
      const _systemTokens = Math.ceil(_systemChars / 4);
      const _msgTokens = Math.ceil(_msgChars / 4);
      const _memoryTokens = Math.ceil(_memoryChars / 4);
      const _totalInputTokens = _systemTokens + _msgTokens;
      const _roles = messages.map((m: any) => m.role).join(',');

      logger.warn(
        `═══ TOKEN_AUDIT total=${_totalInputTokens} | ` +
        `systemTokens=${_systemTokens} (basePrompt=${Math.ceil(_basePromptChars / 4)} + memory=${_memoryTokens}) | ` +
        `msgs[${messages.length}]=${_msgTokens} | ` +
        `agentPromptTokens=${Math.ceil(_agentChars / 4)} | ` +
        `model=${effectiveModel.modelId} complexity=${params.complexity} ` +
        `think=${params.thinkingEnabled} web=${params.webSearchActive} roles=[${_roles}]`
      );

      if (_totalInputTokens > 2000) {
        const _msgBreakdown = messages.map((m: any, i: number) => {
          const len = typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
          return `${i}[${m.role}:${len}]`;
        }).join(',');
        logger.warn(
          `═══ TOKEN_AUDIT DETAIL msgBreakdown=[${_msgBreakdown}] ` +
          `systemPreview="${(systemPrompt || '').substring(0, 150).replace(/\n/g, ' ')}" ` +
          `memoryPreview="${(memoryContext || '').substring(0, 200).replace(/\n/g, ' ')}" ` +
          `lastMsgPreview="${(typeof messages[messages.length - 1]?.content === 'string' ? messages[messages.length - 1].content : JSON.stringify(messages[messages.length - 1]?.content || '')).substring(0, 200).replace(/\n/g, ' ')}"`
        );
      }
    } catch (_auditErr) { /* silent */ }
    // ═══ END TOKEN AUDIT ════════════════════════════════════════

    // Cap output tokens: user balance → provider hard limit → complexity cap
    let effectiveMaxTokens = agentConfig?.maxTokens;
    if (maxOutputTokens && maxOutputTokens > 0) {
      effectiveMaxTokens = effectiveMaxTokens
        ? Math.min(effectiveMaxTokens, maxOutputTokens)
        : maxOutputTokens;
    }
    effectiveMaxTokens = clampMaxTokens(effectiveModel.provider, effectiveMaxTokens);

    // ── COMPLEXITY-AWARE OUTPUT CAPS ──────────────────────────────
    // Without this cap, GPT-5 and reasoning models burn 10K+ tokens on simple
    // queries because they interpret high max_tokens as "go long / think hard".
    // Simple "hey?" should never produce a 10K-token response.
    const complexityCaps: Record<string, number> = {
      simple: 512,     // Greetings, acknowledgments
      standard: 2048,  // Normal questions
      complex: 8192,   // Long code, deep analysis, multi-question
    };
    const complexityCap = complexityCaps[params.complexity || 'standard'] || 2048;
    if (effectiveMaxTokens && effectiveMaxTokens > complexityCap) {
      effectiveMaxTokens = complexityCap;
    }

    const overrides: ProviderOverrides = {
      temperature: agentConfig?.temperature,
      maxTokens: effectiveMaxTokens,
      topP: agentConfig?.topP,
      thinkingEnabled: params.thinkingEnabled,
    };

    await routeToProviderStream(effectiveModel, messages, systemPrompt, callbacks, overrides);

    return { aiModel: effectiveModel, overrides };
  }

  // ─── Vision message routing (image analysis) ───
  static async sendVisionMessage(params: SendVisionParams): Promise<AIResponse> {
    const { modelId, prompt, imageBase64, mimeType, maxOutputTokens } = params;

    // Look up the user-selected model
    let aiModel = await prisma.aIModel.findUnique({
      where: { id: modelId },
    });

    if (!aiModel) {
      throw new AppError('AI Model not found', 404);
    }

    if (!aiModel.isActive) {
      throw new AppError('This model is currently unavailable', 400);
    }

    logger.info(`Vision request for model: ${aiModel.name} (${aiModel.provider})`);

    // If the selected model's provider doesn't support vision,
    // find the best vision-capable model we can use
    let visionModel = aiModel;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    if (!VISION_PROVIDERS.includes(aiModel.provider)) {
      logger.info(`${aiModel.provider} doesn't support vision, finding vision-capable fallback`);

      // Priority: try to find a vision model from a provider we have a key for
      const visionFallback = await prisma.aIModel.findFirst({
        where: {
          isActive: true,
          provider: { in: VISION_PROVIDERS.filter((p) => {
            const key = config.apiKeys[p as keyof typeof config.apiKeys];
            return !!key;
          }) },
        },
        orderBy: { inputTokenPrice: 'asc' }, // cheapest first
      });

      if (!visionFallback) {
        throw new AppError(
          'No vision-capable model available. Configure an API key for OpenAI, Anthropic, or Google.',
          400
        );
      }

      visionModel = visionFallback;
      fallbackUsed = true;
      fallbackReason = `${aiModel.name} doesn't support image analysis, using ${visionFallback.name}`;
      logger.info(`Vision fallback: ${visionFallback.name} (${visionFallback.provider})`);
    }

    // Try the vision call
    let result;
    try {
      result = await routeVisionToProvider(visionModel, prompt, imageBase64, mimeType, maxOutputTokens);

      // If routeVisionToProvider returned null (shouldn't happen after our check, but safety)
      if (!result) {
        throw new AppError('Vision routing failed unexpectedly', 500);
      }
    } catch (error: any) {
      if (error instanceof AppError) throw error;

      const status = error?.response?.status;
      const isRateLimit = status === 429;
      const isProviderDown = status === 503;
      const isTimeout = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';

      if (isRateLimit || isProviderDown || isTimeout) {
        const reason = isRateLimit ? 'Rate limited' : isTimeout ? 'Provider timeout' : 'Provider unavailable';
        logger.warn(`Vision ${reason} for ${visionModel.provider}, trying other vision provider`);

        // Try another vision provider
        const otherVisionModel = await prisma.aIModel.findFirst({
          where: {
            isActive: true,
            provider: {
              in: VISION_PROVIDERS.filter((p) => {
                return p !== visionModel.provider && !!config.apiKeys[p as keyof typeof config.apiKeys];
              }),
            },
          },
          orderBy: { inputTokenPrice: 'asc' },
        });

        if (!otherVisionModel) {
          throw new AppError(`Image analysis failed: ${reason}. No other vision provider available.`, status || 503);
        }

        result = await routeVisionToProvider(otherVisionModel, prompt, imageBase64, mimeType, maxOutputTokens);
        if (!result) {
          throw new AppError('Vision fallback routing failed', 500);
        }

        visionModel = otherVisionModel;
        fallbackUsed = true;
        fallbackReason = reason;
      } else {
        logger.error(`Vision error for ${visionModel.provider}:`, {
          status: error?.response?.status,
          message: error?.response?.data?.error?.message || error.message,
        });
        throw new AppError(
          `Image analysis failed: ${error?.response?.data?.error?.message || error.message || 'Unknown error'}`,
          error?.response?.status || 500
        );
      }
    }

    const costs = calculateCosts(result.inputTokens, result.outputTokens, visionModel);

    return {
      response: result.response,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
      ...costs,
      markupPercentage: visionModel.markupPercentage,
      fallbackUsed,
      fallbackReason,
      aiModel: visionModel,
    };
  }
}

export default AIGatewayService;
