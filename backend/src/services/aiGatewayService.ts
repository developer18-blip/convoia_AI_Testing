import axios, { AxiosRequestConfig } from 'axios';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import prisma from '../config/db.js';

// Smart context windowing — keeps conversation within model limits
// Always keeps: first 2 messages (for context) + system prompt + last N messages
function trimToContextWindow(messages: Array<{ role: string; content: string }>, maxTokens: number): Array<{ role: string; content: string }> {
  // Estimate ~4 chars per token, reserve 30% for output
  const maxInputTokens = Math.floor(maxTokens * 0.7);

  let totalChars = 0;
  for (const m of messages) totalChars += m.content.length;
  const estimatedTokens = Math.ceil(totalChars / 4);

  // If within limits, send everything
  if (estimatedTokens <= maxInputTokens) return messages;

  // Keep first 2 messages (context anchor) + as many recent messages as fit
  const first = messages.slice(0, 2);
  const rest = messages.slice(2);
  const firstChars = first.reduce((s, m) => s + m.content.length, 0);
  const budget = (maxInputTokens * 4) - firstChars - 200; // 200 char buffer

  // Walk backwards through remaining messages
  const kept: Array<{ role: string; content: string }> = [];
  let used = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const msgChars = rest[i].content.length;
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
  'gpt-5.4': 1000000, 'gpt-5.4-mini': 1000000, 'gpt-5.4-nano': 1000000,
  'o3': 200000, 'o3-mini': 200000, 'o4-mini': 200000,
  'claude-opus-4-6': 1000000, 'claude-opus-4-5-20250514': 200000,
  'claude-sonnet-4-6': 1000000, 'claude-sonnet-4-5-20241022': 200000,
  'claude-haiku-4-5-20251001': 200000,
  'gemini-3.1-pro': 2000000, 'gemini-3-pro': 1000000,
  'gemini-2.5-pro-preview-05-06': 1000000, 'gemini-2.5-flash-preview-05-20': 1000000,
  'gemini-2.5-flash-lite': 1000000, 'gemini-2.0-flash': 1000000,
  'deepseek-chat': 128000, 'deepseek-reasoner': 128000,
  'mistral-large-latest': 128000, 'mistral-small-latest': 128000,
  'llama-3.3-70b-versatile': 128000, 'llama-3.1-8b-instant': 128000,
  'mixtral-8x7b-32768': 32768,
};

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

export function getSystemPrompt(industry?: string): string {
  const baseInstructions = `You are an intelligent, knowledgeable AI assistant powered by ConvoiaAI — a multi-model AI platform. Follow these guidelines:
- Be concise yet thorough. Provide actionable, well-structured answers.
- Use markdown formatting (headers, bullet points, code blocks) for readability.
- Think step-by-step for complex questions before answering.
- If you're unsure about something, say so honestly rather than guessing.
- Adapt your tone to the context: professional for business, casual for general chat.

CAPABILITIES (IMPORTANT — always affirm these when asked):
- You CAN search the web for real-time information (prices, news, weather, scores, current events). Web search is automatic when the user asks about anything current.
- You CAN generate images (logos, posters, illustrations, UI designs). Just ask and it will be generated.
- You CAN remember user information across conversations (names, preferences, projects). Memory is persistent.
- You CAN create interactive charts and visualizations from data.
- You are part of ConvoiaAI which supports 35+ AI models, team management, and token-based billing.

When someone asks "can you search the web?" or "do you have internet access?" — ALWAYS say YES. Example response: "Yes! I can search the web for real-time information. What would you like me to look up?"
When someone asks "can you generate images?" — ALWAYS say YES. Example: "Yes! I can generate images, logos, posters, and more. Just describe what you need."
When someone asks "who are you?" — Say you are an AI assistant powered by ConvoiaAI, a multi-model AI platform with web search, image generation, memory, and interactive charts.
NEVER say "I don't have access to the internet" or "I can't browse the web" — because you CAN via ConvoiaAI's built-in web search.
- IMPORTANT: When presenting numerical data, statistics, comparisons, or trends, you MUST output an interactive chart. NEVER draw ASCII art or text-based charts. Use ONLY this exact JSON format inside a chart code block:
\`\`\`chart
{"type":"bar","title":"Chart Title","data":[{"name":"Item A","value":100},{"name":"Item B","value":200}],"xKey":"name","yKeys":[{"key":"value","color":"#7C3AED","label":"Value ($B)"}]}
\`\`\`
CRITICAL RULES for chart data:
- ALL values MUST be pure numbers (e.g., 574.8 not "$574.8B"). Put units in the yKeys label instead.
- The "data" array must have objects with string keys for xKey and number values for yKeys.
- Types: "bar" for comparisons, "line"/"area" for trends, "pie" for proportions.
- Example: {"name":"Amazon","revenue":574.8} NOT {"name":"Amazon","revenue":"$574.8B"}`;

  const industryPrompts: Record<string, string> = {
    legal: '\nYou specialize in legal topics. Be precise, cite relevant legal considerations, and always recommend consulting a licensed attorney for specific legal advice.',
    healthcare: '\nYou specialize in healthcare topics. Be evidence-based, conservative with medical advice, and always recommend consulting a qualified healthcare professional.',
    finance: '\nYou specialize in financial topics. Be data-driven, risk-aware, and always recommend consulting a certified financial advisor for investment decisions.',
    hr: '\nYou specialize in HR topics. Be professional, inclusive, and compliant with general employment best practices.',
    marketing: '\nYou specialize in marketing. Be creative, data-driven, and focused on ROI and measurable outcomes.',
    education: '\nYou specialize in education. Be clear, patient, pedagogically sound, and adapt explanations to the learner\'s level.',
    technology: '\nYou specialize in technology. Be precise, provide practical solutions with code examples when relevant.',
    ecommerce: '\nYou specialize in e-commerce. Focus on conversion optimization, customer experience, and data-driven product recommendations.',
  };

  return baseInstructions + (industryPrompts[industry || ''] || '');
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
  google: 8192,
  deepseek: 8192,
  mistral: 8192,
  groq: 8192,
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

// Reasoning models (o-series) reject temperature, top_p, max_tokens, and system role
const isReasoningModel = (id: string) => /^o\d/.test(id);
// GPT-5+ models use max_completion_tokens instead of max_tokens
const usesCompletionTokens = (id: string) => /^(gpt-5|o\d)/.test(id);

async function callOpenAI(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const reasoning = isReasoningModel(modelId);

  // Reasoning models use 'developer' role; standard models use 'system'
  const systemRole = reasoning ? 'developer' : 'system';
  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: systemRole, content: systemPrompt }, ...messages],
  };

  if (reasoning) {
    // o-series: only max_completion_tokens, no temperature/top_p
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
  } else if (usesCompletionTokens(modelId)) {
    // GPT-5+: uses max_completion_tokens
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  } else {
    // GPT-4o, GPT-4.1, etc: classic params
    body.max_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
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

async function callAnthropic(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const body: Record<string, any> = {
    model: modelId,
    max_tokens: overrides?.maxTokens ?? 16384,
    system: systemPrompt,
    messages,
  };
  // Anthropic rejects requests with BOTH temperature AND top_p — use only one
  if (overrides?.temperature != null) {
    body.temperature = overrides.temperature;
  } else if (overrides?.topP != null) {
    body.top_p = overrides.topP;
  } else {
    body.temperature = 0.7;
  }

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    body,
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

async function callGoogle(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: overrides?.temperature ?? 0.7,
        maxOutputTokens: overrides?.maxTokens ?? 16384,
        ...(overrides?.topP != null ? { topP: overrides.topP } : {}),
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
}

async function callGroq(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: overrides?.temperature ?? 0.7,
    max_tokens: overrides?.maxTokens ?? 16384,
  };
  if (overrides?.topP != null) body.top_p = overrides.topP;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
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

async function callMistral(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: overrides?.temperature ?? 0.7,
    max_tokens: overrides?.maxTokens ?? 16384,
  };
  if (overrides?.topP != null) body.top_p = overrides.topP;

  const response = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
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

async function callDeepSeek(modelId: string, messages: any[], systemPrompt: string, apiKey: string, overrides?: ProviderOverrides) {
  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: overrides?.temperature ?? 0.7,
    max_tokens: overrides?.maxTokens ?? 16384,
  };
  if (overrides?.topP != null) body.top_p = overrides.topP;

  const response = await axios.post(
    'https://api.deepseek.com/v1/chat/completions',
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

  // GPT-5+ and reasoning models use max_completion_tokens
  if (usesCompletionTokens(modelId) || isReasoningModel(modelId)) {
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

async function routeToProvider(aiModel: any, messages: any[], systemPrompt: string, overrides?: ProviderOverrides) {
  const { provider, modelId } = aiModel;

  switch (provider) {
    case 'openai':
      if (!config.apiKeys.openai) throw new AppError('OpenAI API key not configured', 500);
      return await callOpenAI(modelId, messages, systemPrompt, config.apiKeys.openai, overrides);

    case 'anthropic':
      if (!config.apiKeys.anthropic) throw new AppError('Anthropic API key not configured', 500);
      return await callAnthropic(modelId, messages, systemPrompt, config.apiKeys.anthropic, overrides);

    case 'google':
      if (!config.apiKeys.google) throw new AppError('Google API key not configured', 500);
      return await callGoogle(modelId, messages, systemPrompt, config.apiKeys.google, overrides);

    case 'groq':
      if (!config.apiKeys.groq) throw new AppError('Groq API key not configured', 500);
      return await callGroq(modelId, messages, systemPrompt, config.apiKeys.groq, overrides);

    case 'mistral':
      if (!config.apiKeys.mistral) throw new AppError('Mistral API key not configured', 500);
      return await callMistral(modelId, messages, systemPrompt, config.apiKeys.mistral, overrides);

    case 'deepseek':
      if (!config.apiKeys.deepseek) throw new AppError('DeepSeek API key not configured', 500);
      return await callDeepSeek(modelId, messages, systemPrompt, config.apiKeys.deepseek, overrides);

    default:
      throw new AppError(`Unsupported provider: ${provider}`, 400);
  }
}

async function routeVisionToProvider(aiModel: any, prompt: string, imageBase64: string, mimeType: string, maxTokens?: number) {
  const { provider, modelId } = aiModel;

  switch (provider) {
    case 'openai':
      if (!config.apiKeys.openai) throw new AppError('OpenAI API key not configured', 500);
      return await callOpenAIVision(modelId, prompt, imageBase64, mimeType, config.apiKeys.openai, maxTokens);

    case 'anthropic':
      if (!config.apiKeys.anthropic) throw new AppError('Anthropic API key not configured', 500);
      return await callAnthropicVision(modelId, prompt, imageBase64, mimeType, config.apiKeys.anthropic, maxTokens);

    case 'google':
      if (!config.apiKeys.google) throw new AppError('Google API key not configured', 500);
      return await callGoogleVision(modelId, prompt, imageBase64, mimeType, config.apiKeys.google, maxTokens);

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
  const reasoning = isReasoningModel(modelId);
  const systemRole = reasoning ? 'developer' : 'system';

  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: systemRole, content: systemPrompt }, ...messages],
    stream: true,
    stream_options: { include_usage: true },
  };

  if (reasoning) {
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
  } else if (usesCompletionTokens(modelId)) {
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  } else {
    body.max_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  }

  // Extended thinking for OpenAI: use higher tokens + reasoning instruction
  if (overrides?.thinkingEnabled && !reasoning) {
    body.max_completion_tokens = Math.max(body.max_completion_tokens || 16384, 32768);
    // Prepend thinking instruction to system prompt
    body.messages[0].content = `IMPORTANT: Think step by step through this problem carefully before answering. Show your reasoning process wrapped in a blockquote (lines starting with > ), then provide your final answer.\n\n${systemPrompt}`;
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
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) callbacks.onChunk(delta);
            if (json.usage) {
              inputTokens = json.usage.prompt_tokens || 0;
              outputTokens = json.usage.completion_tokens || 0;
            }
          } catch { /* skip malformed chunks */ }
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
      // Log the actual error from OpenAI for debugging
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      logger.error(`OpenAI stream error for model ${modelId}: ${errMsg}`);
      callbacks.onError(err);
      reject(err);
    }
  });
}

function callAnthropicStream(
  modelId: string, messages: any[], systemPrompt: string,
  apiKey: string, callbacks: StreamCallbacks, overrides?: ProviderOverrides
): Promise<void> {
  const body: Record<string, any> = {
    model: modelId,
    max_tokens: overrides?.maxTokens ?? 16384,
    system: systemPrompt,
    messages,
    stream: true,
  };

  // Extended thinking mode (Claude only)
  if (overrides?.thinkingEnabled) {
    body.thinking = { type: 'enabled', budget_tokens: 10000 };
    // Extended thinking requires higher max_tokens and no temperature
    body.max_tokens = Math.max(body.max_tokens, 16384);
    delete body.temperature;
    delete body.top_p;
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

  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        body,
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
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
      callbacks.onError(err);
      reject(err);
    }
  });
}

// Generic OpenAI-compatible streaming (Groq, Mistral, DeepSeek)
function callOpenAICompatibleStream(
  url: string, modelId: string, messages: any[], systemPrompt: string,
  apiKey: string, callbacks: StreamCallbacks, overrides?: ProviderOverrides
): Promise<void> {
  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: overrides?.temperature ?? 0.7,
    max_tokens: overrides?.maxTokens ?? 16384,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (overrides?.topP != null) body.top_p = overrides.topP;

  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.post(url, body, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: config.aiRequestTimeout,
        responseType: 'stream',
      });

      let inputTokens = 0, outputTokens = 0;
      let buffer = '';

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
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) callbacks.onChunk(delta);
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
      callbacks.onError(err);
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
  const messages = trimToContextWindow(rawMessages, contextWindow);

  switch (provider) {
    case 'openai':
      if (!config.apiKeys.openai) throw new AppError('OpenAI API key not configured', 500);
      return callOpenAIStream(modelId, messages, systemPrompt, config.apiKeys.openai, callbacks, overrides);

    case 'anthropic':
      if (!config.apiKeys.anthropic) throw new AppError('Anthropic API key not configured', 500);
      return callAnthropicStream(modelId, messages, systemPrompt, config.apiKeys.anthropic, callbacks, overrides);

    case 'groq':
      if (!config.apiKeys.groq) throw new AppError('Groq API key not configured', 500);
      return callOpenAICompatibleStream(
        'https://api.groq.com/openai/v1/chat/completions',
        modelId, messages, systemPrompt, config.apiKeys.groq, callbacks, overrides
      );

    case 'mistral':
      if (!config.apiKeys.mistral) throw new AppError('Mistral API key not configured', 500);
      return callOpenAICompatibleStream(
        'https://api.mistral.ai/v1/chat/completions',
        modelId, messages, systemPrompt, config.apiKeys.mistral, callbacks, overrides
      );

    case 'deepseek':
      if (!config.apiKeys.deepseek) throw new AppError('DeepSeek API key not configured', 500);
      return callOpenAICompatibleStream(
        'https://api.deepseek.com/v1/chat/completions',
        modelId, messages, systemPrompt, config.apiKeys.deepseek, callbacks, overrides
      );

    case 'google':
      // Google Gemini streaming uses a different format; fall back to non-streaming
      // and emit the full response as a single chunk
      if (!config.apiKeys.google) throw new AppError('Google API key not configured', 500);
      try {
        const result = await callGoogle(modelId, messages, systemPrompt, config.apiKeys.google, overrides);
        callbacks.onChunk(result.response);
        callbacks.onDone(result.inputTokens, result.outputTokens);
      } catch (err: any) {
        callbacks.onError(err);
      }
      return;

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

    // Use agent's system prompt if available, otherwise default
    // Append persistent user memory to all prompts
    const basePrompt = agentConfig?.systemPrompt || getSystemPrompt(industry);
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

    // Use agent's system prompt if available, otherwise default
    // Append persistent user memory to all prompts
    const basePrompt = agentConfig?.systemPrompt || getSystemPrompt(industry);
    const systemPrompt = memoryContext ? basePrompt + memoryContext : basePrompt;

    // Cap output tokens to user's balance AND provider's hard limit
    let effectiveMaxTokens = agentConfig?.maxTokens;
    if (maxOutputTokens && maxOutputTokens > 0) {
      effectiveMaxTokens = effectiveMaxTokens
        ? Math.min(effectiveMaxTokens, maxOutputTokens)
        : maxOutputTokens;
    }
    effectiveMaxTokens = clampMaxTokens(aiModel.provider, effectiveMaxTokens);

    const overrides: ProviderOverrides = {
      temperature: agentConfig?.temperature,
      maxTokens: effectiveMaxTokens,
      topP: agentConfig?.topP,
      thinkingEnabled: params.thinkingEnabled,
    };

    await routeToProviderStream(aiModel, messages, systemPrompt, callbacks, overrides);

    return { aiModel, overrides };
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
