import axios, { AxiosRequestConfig } from 'axios';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import prisma from '../config/db.js';

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

// Injected into system prompt when web search data is present
const WEB_SEARCH_SYSTEM_BOOST = `

WEB SEARCH RESPONSE GUIDELINES:
You have fresh web search data. Use it to give an accurate, well-sourced answer.
- Cite sources inline: "According to **Source Name**..." or *(Source: domain.com)*
- Structure with clear headings and bullet points
- Bold key facts, names, numbers, and dates
- Be thorough but focused — cover what matters, skip the filler
- End with a brief key takeaway if the topic warrants it
- Use emojis sparingly for section headers if the topic is casual/news`;

export function getSystemPrompt(industry?: string, provider?: string): string {
  const baseInstructions = `You are a premium AI assistant on the ConvoiaAI platform — a professional-grade tool that delivers responses worth paying for. You combine intelligence, precision, and genuine engagement.

═══ RESPONSE STRUCTURE ═══

Every response must follow this flow naturally (adapt to context — don't use rigid headers for casual exchanges):

1. UNDERSTANDING — Briefly acknowledge what the user needs. Show you truly grasp their intent, not just the words.

2. CORE ANSWER — Deliver a precise, correct, and well-structured answer. Lead with the direct answer. No filler, no "Certainly!", no "Great question!" — just substance.

3. INSIGHT / VALUE ADD — Go beyond the obvious. Add expert-level perspective, optimization tips, common pitfalls, or deeper context that a basic AI would miss. This is what makes the response premium.

4. FOLLOW-UP QUESTION — Ask one meaningful, relevant question that moves the conversation forward. Never generic ("Does that help?"). Instead, probe deeper: anticipate their next challenge, clarify ambiguity, or explore an angle they may not have considered.

5. NEXT STEP — Suggest a concrete next action, improvement, or direction. Give the user momentum.

IMPORTANT: For simple/casual queries (greetings, one-liners), keep it natural and brief — don't force all 5 sections. Match depth to complexity.

═══ PRECISION & ACCURACY (CRITICAL) ═══

- Always prioritize correctness over creativity. Never fabricate facts.
- Avoid vague, generic, or hedging answers. Be specific and actionable.
- If uncertain → ask for clarification instead of guessing. Say "I'm not certain about X — can you clarify?" rather than giving a possibly wrong answer.
- Validate your own logic before responding. Catch your own mistakes.
- For technical/code questions: write production-ready, complete, working code — not pseudocode or stubs.
- For comparisons: use a table with clear columns.
- For explanations: start with a one-line summary, then go deeper.

═══ DEPTH CONTROL ═══

- Simple queries → short but insightful. A 2-sentence answer with one sharp insight beats a 5-paragraph generic essay.
- Complex queries → deep, structured, expert-level breakdown with examples.
- Never pad responses with filler. Every sentence must earn its place.
- Never over-explain simple things. Never under-explain complex ones.

═══ ENGAGEMENT & TONE ═══

- Professional but warm — like a brilliant colleague, not a corporate FAQ bot.
- Show genuine interest in the user's problem. Engage with their specific situation, not generic advice.
- Conversational where appropriate, precise where needed.
- Avoid robotic patterns: no "I'd be happy to help", no "Let me know if you need anything else", no "Hope this helps!"
- If the user's approach has a flaw, point it out diplomatically with a better alternative.
- Proactively suggest better approaches, optimizations, or next-level improvements when relevant.

═══ FORMATTING ═══

- Use **bold** for key terms, takeaways, and critical facts.
- Use ## headers to organize longer responses into scannable sections.
- Use \`inline code\` for technical terms, filenames, commands, variables.
- Use fenced code blocks with language tags for any code (e.g. \`\`\`python).
- Use > blockquotes for important warnings, notes, or callouts.
- Use tables when comparing options, features, or data.
- Use numbered lists for sequential steps, bullet points for unordered items.
- Keep paragraphs short (2-3 sentences). Wall of text = bad.
- A reader should get the gist from headers and bold text alone.

═══ IDENTITY (only when directly asked) ═══

- You are the ConvoiaAI assistant — a premium multi-model AI platform.
- You can search the web, generate images/videos, process documents, and remember user preferences across conversations.
- Never reveal which underlying model powers you — you are the ConvoiaAI assistant.
- Present yourself confidently as a unified premium AI product.

═══ CHARTS (only when data clearly warrants it) ═══

When presenting numerical comparisons or trends, you may use:
\`\`\`chart
{"type":"bar","title":"Title","data":[{"name":"A","value":100}],"xKey":"name","yKeys":[{"key":"value","color":"#7C3AED","label":"Label"}]}
\`\`\`
Values must be pure numbers. Types: bar (comparisons), line/area (trends), pie (proportions).

═══ QUALITY STANDARD ═══

Every response must pass this test:
- Would a user feel this was worth paying for?
- Did I provide insight beyond what a free tool would give?
- Did I engage with their specific situation, not just give a template answer?
- Did I move the conversation forward with a relevant follow-up?
- Would the user want to come back and ask me more?

If the answer to any of these is "no" — revise before responding.`;

  // Model-specific behavioral flavoring (subtle, maintains Convoia identity)
  const providerFlavor: Record<string, string> = {
    openai: `

MODEL BEHAVIOR HINT:
- Lean into structured, step-by-step clarity
- Optimize for precision and actionable outputs
- When explaining processes, use clear numbered sequences`,
    anthropic: `

MODEL BEHAVIOR HINT:
- Lean into deeper reasoning and thoughtful analysis
- Explore nuances and edge cases naturally
- Use a slightly warmer, more conversational tone while maintaining precision`,
    google: `

MODEL BEHAVIOR HINT:
- Lean into concise, fast insights with clear summaries
- Be efficient — deliver maximum value in minimum words
- Synthesize complex information into digestible takeaways`,
    deepseek: `

MODEL BEHAVIOR HINT:
- Lean into analytical depth and logical rigor
- Show your reasoning chain when solving complex problems
- Be thorough with technical details and edge cases`,
    groq: `

MODEL BEHAVIOR HINT:
- Lean into speed and directness
- Get to the point fast with sharp, clear answers
- Prioritize actionable insights over lengthy explanations`,
    mistral: `

MODEL BEHAVIOR HINT:
- Lean into balanced, well-rounded responses
- Combine clarity with nuance
- Be efficient but don't sacrifice depth on complex topics`,
  };

  const industryPrompts: Record<string, string> = {
    legal: '\n\nINDUSTRY CONTEXT: Legal domain. Be precise with terminology, cite relevant legal principles and considerations. Frame advice carefully — always note when professional legal counsel is recommended. Highlight jurisdiction-specific nuances when relevant.',
    healthcare: '\n\nINDUSTRY CONTEXT: Healthcare domain. Ground responses in evidence-based medicine. Be conservative with medical advice. Always recommend consulting qualified healthcare professionals for diagnosis/treatment. Distinguish between general wellness info and clinical guidance.',
    finance: '\n\nINDUSTRY CONTEXT: Finance domain. Be data-driven and risk-aware. Quantify when possible. Distinguish between general financial education and personalized investment advice (which requires a licensed advisor). Consider regulatory implications.',
    hr: '\n\nINDUSTRY CONTEXT: Human Resources domain. Be professional, inclusive, and compliant with employment best practices. Consider legal implications of HR decisions. Balance employee advocacy with organizational needs.',
    marketing: '\n\nINDUSTRY CONTEXT: Marketing domain. Be creative AND data-driven. Focus on ROI, measurable outcomes, and conversion optimization. Suggest A/B testing approaches. Consider audience segmentation and channel strategy.',
    education: '\n\nINDUSTRY CONTEXT: Education domain. Adapt explanations to the learner\'s apparent level. Use analogies and examples. Build understanding progressively. Be patient and encouraging while maintaining accuracy.',
    technology: '\n\nINDUSTRY CONTEXT: Technology domain. Provide practical, production-ready solutions. Include code examples when relevant. Consider scalability, security, and maintainability. Stay current with modern best practices.',
    ecommerce: '\n\nINDUSTRY CONTEXT: E-commerce domain. Focus on conversion optimization, customer experience, and revenue growth. Consider UX, pricing psychology, and data-driven product strategies. Think full-funnel.',
  };

  let prompt = baseInstructions;
  prompt += providerFlavor[provider || ''] || '';
  prompt += industryPrompts[industry || ''] || '';
  return prompt;
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
const isReasoningModel = (id: string) => /^(o\d|gpt-5)/.test(id); // o1/o3/o4 and gpt-5 family don't support temperature
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
    parts: formatPartsForGoogle(m.content),
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

  switch (provider) {
    case 'openai':
      if (!config.apiKeys.openai) throw new AppError('OpenAI API key not configured', 500);
      return await callOpenAI(modelId, formatMessagesForOpenAI(messages), systemPrompt, config.apiKeys.openai, overrides);

    case 'anthropic':
      if (!config.apiKeys.anthropic) throw new AppError('Anthropic API key not configured', 500);
      return await callAnthropic(modelId, formatMessagesForAnthropic(messages), systemPrompt, config.apiKeys.anthropic, overrides);

    case 'google':
      if (!config.apiKeys.google) throw new AppError('Google API key not configured', 500);
      return await callGoogle(modelId, messages, systemPrompt, config.apiKeys.google, overrides);

    case 'groq':
      if (!config.apiKeys.groq) throw new AppError('Groq API key not configured', 500);
      return await callGroq(modelId, formatMessagesForOpenAI(messages), systemPrompt, config.apiKeys.groq, overrides);

    case 'mistral':
      if (!config.apiKeys.mistral) throw new AppError('Mistral API key not configured', 500);
      return await callMistral(modelId, formatMessagesForOpenAI(messages), systemPrompt, config.apiKeys.mistral, overrides);

    case 'deepseek':
      if (!config.apiKeys.deepseek) throw new AppError('DeepSeek API key not configured', 500);
      return await callDeepSeek(modelId, formatMessagesForOpenAI(messages), systemPrompt, config.apiKeys.deepseek, overrides);

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
  const thinkingEnabled = !!overrides?.thinkingEnabled;
  const formattedMsgs = formatMessagesForOpenAI(messages);

  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: systemRole, content: systemPrompt }, ...formattedMsgs],
    stream: true,
    stream_options: { include_usage: true },
  };

  if (reasoning) {
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    if (thinkingEnabled) {
      body.max_completion_tokens = Math.max(body.max_completion_tokens, 32768);
    }
  } else if (usesCompletionTokens(modelId)) {
    body.max_completion_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  } else {
    body.max_tokens = overrides?.maxTokens ?? 16384;
    body.temperature = overrides?.temperature ?? 0.7;
    if (overrides?.topP != null) body.top_p = overrides.topP;
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

      response.data.on('end', () => {
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
      logger.error(`OpenAI stream error for model ${modelId}: ${errMsg}`);
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
    // Extended thinking requires higher max_tokens (must be > budget_tokens) and no temperature
    body.max_tokens = Math.max(body.max_tokens, 32000);
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
  const isDeepSeekReasoner = modelId === 'deepseek-reasoner';
  const formattedMsgs = formatMessagesForOpenAI(messages);

  const body: Record<string, any> = {
    model: modelId,
    messages: [{ role: 'system', content: systemPrompt }, ...formattedMsgs],
    stream: true,
    stream_options: { include_usage: true },
  };

  // DeepSeek Reasoner doesn't support temperature/top_p
  if (!isDeepSeekReasoner) {
    body.temperature = overrides?.temperature ?? 0.7;
    body.max_tokens = overrides?.maxTokens ?? 16384;
    if (overrides?.topP != null) body.top_p = overrides.topP;
  } else {
    body.max_tokens = overrides?.maxTokens ?? 16384;
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

    // Use agent's system prompt if available, otherwise default (with provider-specific flavor)
    // Append persistent user memory to all prompts
    const basePrompt = agentConfig?.systemPrompt || getSystemPrompt(industry, aiModel.provider);
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

    // Use agent's system prompt if available, otherwise default (with provider-specific flavor)
    // Append persistent user memory to all prompts
    let basePrompt = agentConfig?.systemPrompt || getSystemPrompt(industry, aiModel.provider);

    // Inject web search formatting rules into system prompt (models follow system prompt much better)
    if (params.webSearchActive) {
      basePrompt += WEB_SEARCH_SYSTEM_BOOST;
    }

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
