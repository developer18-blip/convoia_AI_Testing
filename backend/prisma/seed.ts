/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * AI Model seed data — real model IDs with approximate per-token pricing (USD).
 * Prices are provider cost; the 25% markup is applied dynamically at query time.
 *
 * Last updated: 2026-03-22
 * Sources: OpenAI, Anthropic, Google, DeepSeek official pricing pages
 */
const aiModels = [
  // ═══════════════════════════════════════════════════════════
  //  OpenAI — Chat Models
  // ═══════════════════════════════════════════════════════════

  // GPT-5.4 Family (Latest — March 2026)
  {
    name: 'GPT-5.4',
    provider: 'openai',
    modelId: 'gpt-5.4',
    description: 'Latest OpenAI flagship — best reasoning, coding, and analysis',
    inputTokenPrice: 0.000005,     // $5.00 / 1M input
    outputTokenPrice: 0.000015,    // $15.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode', 'reasoning'],
    contextWindow: 256000,
  },
  // GPT-5.4 Pro and o3 Pro require Responses API (not chat completions) — skipped
  {
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    modelId: 'gpt-5.4-mini',
    description: 'Fast & affordable GPT-5.4 — great balance of speed and quality',
    inputTokenPrice: 0.0000004,    // $0.40 / 1M input
    outputTokenPrice: 0.0000016,   // $1.60 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'GPT-5.4 Nano',
    provider: 'openai',
    modelId: 'gpt-5.4-nano',
    description: 'Ultra-cheap GPT-5.4 — perfect for high-volume simple tasks',
    inputTokenPrice: 0.0000001,    // $0.10 / 1M input
    outputTokenPrice: 0.0000004,   // $0.40 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },

  // GPT-5 Family
  {
    name: 'GPT-5',
    provider: 'openai',
    modelId: 'gpt-5',
    description: 'GPT-5 flagship — massive leap in reasoning and creativity',
    inputTokenPrice: 0.000005,     // $5.00 / 1M input
    outputTokenPrice: 0.000015,    // $15.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode', 'reasoning'],
    contextWindow: 256000,
  },
  {
    name: 'GPT-5 Mini',
    provider: 'openai',
    modelId: 'gpt-5-mini',
    description: 'Efficient GPT-5 — smart and affordable',
    inputTokenPrice: 0.0000004,    // $0.40 / 1M input
    outputTokenPrice: 0.0000016,   // $1.60 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },

  // GPT-4.1 Family
  {
    name: 'GPT-4.1',
    provider: 'openai',
    modelId: 'gpt-4.1',
    description: 'GPT-4.1 flagship — strong coding and instruction following',
    inputTokenPrice: 0.000002,     // $2.00 / 1M input
    outputTokenPrice: 0.000008,    // $8.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
  },
  {
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    modelId: 'gpt-4.1-mini',
    description: 'GPT-4.1 Mini — fast, cheap, great for everyday tasks',
    inputTokenPrice: 0.0000004,    // $0.40 / 1M input
    outputTokenPrice: 0.0000016,   // $1.60 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
  },
  {
    name: 'GPT-4.1 Nano',
    provider: 'openai',
    modelId: 'gpt-4.1-nano',
    description: 'Cheapest GPT-4.1 — ultra-fast for simple queries',
    inputTokenPrice: 0.0000001,    // $0.10 / 1M input
    outputTokenPrice: 0.0000004,   // $0.40 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
  },

  // GPT-4o Family (still widely used)
  {
    name: 'GPT-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    description: 'OpenAI multimodal model — fast, smart, affordable',
    inputTokenPrice: 0.0000025,    // $2.50 / 1M input
    outputTokenPrice: 0.000010,    // $10.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'GPT-4o Mini',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    description: 'Small, fast, cheap — great for simple tasks',
    inputTokenPrice: 0.00000015,   // $0.15 / 1M input
    outputTokenPrice: 0.0000006,   // $0.60 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },

  // ─── OpenAI Reasoning Models (o-series) ───
  {
    name: 'o3',
    provider: 'openai',
    modelId: 'o3',
    description: 'Best reasoning model — math, science, coding competitions',
    inputTokenPrice: 0.000010,     // $10.00 / 1M input
    outputTokenPrice: 0.000040,    // $40.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
    contextWindow: 200000,
  },
  {
    name: 'o4 Mini',
    provider: 'openai',
    modelId: 'o4-mini',
    description: 'Fast reasoning model — great for STEM and coding',
    inputTokenPrice: 0.000001,     // $1.00 / 1M input
    outputTokenPrice: 0.000004,    // $4.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
    contextWindow: 200000,
  },
  {
    name: 'o3 Mini',
    provider: 'openai',
    modelId: 'o3-mini',
    description: 'Affordable reasoning — solid for math and logic',
    inputTokenPrice: 0.0000011,    // $1.10 / 1M input
    outputTokenPrice: 0.0000044,   // $4.40 / 1M output
    capabilities: ['chat', 'function_calling', 'reasoning'],
    contextWindow: 200000,
  },

  // ─── OpenAI Image Generation ───
  {
    name: 'GPT Image 1',
    provider: 'openai',
    modelId: 'gpt-image-1',
    description: 'Latest image generation — photorealistic, artistic, text-in-image',
    inputTokenPrice: 0.000005,     // $5.00 / 1M input (text prompt)
    outputTokenPrice: 0.000040,    // $40.00 / 1M output (image tokens)
    capabilities: ['image_generation'],
    contextWindow: 32000,
  },
  {
    name: 'DALL-E 3',
    provider: 'openai',
    modelId: 'dall-e-3',
    description: 'High-quality image generation with excellent prompt following',
    inputTokenPrice: 0.000040,     // ~$0.04 per 1024x1024 standard
    outputTokenPrice: 0.000080,    // ~$0.08 per 1024x1024 HD
    capabilities: ['image_generation'],
    contextWindow: 4000,
  },

  // ═══════════════════════════════════════════════════════════
  //  Anthropic — Claude Models
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
    description: 'Most capable Claude — best reasoning, coding, and analysis',
    inputTokenPrice: 0.000005,     // $5.00 / 1M input
    outputTokenPrice: 0.000025,    // $25.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },
  {
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    modelId: 'claude-opus-4-5-20251101',
    description: 'Previous-gen Opus — creative writing, deep analysis',
    inputTokenPrice: 0.000005,     // $5.00 / 1M input
    outputTokenPrice: 0.000025,    // $25.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },
  {
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    description: 'Best balance of speed and intelligence — great all-rounder',
    inputTokenPrice: 0.000003,     // $3.00 / 1M input
    outputTokenPrice: 0.000015,    // $15.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },
  {
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250929',
    description: 'Previous-gen Sonnet — reliable and fast',
    inputTokenPrice: 0.000003,     // $3.00 / 1M input
    outputTokenPrice: 0.000015,    // $15.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },
  {
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    description: 'Fastest Claude — instant responses at lowest cost',
    inputTokenPrice: 0.000001,     // $1.00 / 1M input
    outputTokenPrice: 0.000005,    // $5.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },

  // ═══════════════════════════════════════════════════════════
  //  Google — Gemini Models
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Gemini 3.1 Pro',
    provider: 'google',
    modelId: 'gemini-3.1-pro-preview',
    description: 'Latest Google flagship — strongest reasoning and multimodal',
    inputTokenPrice: 0.00000125,   // $1.25 / 1M input
    outputTokenPrice: 0.000005,    // $5.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 2097152,
  },
  {
    name: 'Gemini 3 Pro (Deprecated)',
    provider: 'google',
    modelId: 'gemini-3-pro-preview',
    description: 'Deprecated March 9, 2026 — use Gemini 3.1 Pro instead',
    isActive: false,
    inputTokenPrice: 0.00000125,   // $1.25 / 1M input
    outputTokenPrice: 0.000005,    // $5.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
  },
  {
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    description: 'Google reasoning powerhouse with thinking capabilities',
    inputTokenPrice: 0.00000125,   // $1.25 / 1M input
    outputTokenPrice: 0.000010,    // $10.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode', 'reasoning'],
    contextWindow: 1048576,
  },
  {
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    modelId: 'gemini-2.5-flash',
    description: 'Ultra-fast with thinking — best speed/quality ratio',
    inputTokenPrice: 0.00000015,   // $0.15 / 1M input
    outputTokenPrice: 0.0000006,   // $0.60 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode', 'reasoning'],
    contextWindow: 1048576,
  },
  {
    name: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    modelId: 'gemini-2.5-flash-lite',
    description: 'Cheapest Gemini — great for high-volume, simple tasks',
    inputTokenPrice: 0.0000000375, // $0.0375 / 1M input
    outputTokenPrice: 0.00000015,  // $0.15 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
  },
  {
    // Deprecated upstream by Google (2026-05) — bare `gemini-2.0-flash`
    // model ID returns 404 from generativelanguage.googleapis.com. Kept
    // in seed for historical reference; isActive=false hides it from
    // the picker. Use gemini-2.5-flash / gemini-2.5-flash-lite instead.
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    modelId: 'gemini-2.0-flash',
    description: 'Fast multimodal model with large context',
    inputTokenPrice: 0.0000001,    // $0.10 / 1M input
    outputTokenPrice: 0.0000004,   // $0.40 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
    isActive: false,
  },

  // ─── Google Image Generation ───
  {
    name: 'Gemini 2.5 Flash Image',
    provider: 'google',
    modelId: 'gemini-2.5-flash-image',
    description: 'Gemini-powered image generation and editing',
    inputTokenPrice: 0.00000015,   // $0.15 / 1M input
    outputTokenPrice: 0.0000006,   // $0.60 / 1M output
    capabilities: ['image_generation', 'vision'],
    contextWindow: 1048576,
  },
  {
    name: 'Gemini 3 Pro Image (Deprecated)',
    provider: 'google',
    modelId: 'gemini-3-pro-image-preview',
    description: 'Deprecated March 9, 2026 — use Gemini 3.1 Flash Image instead',
    isActive: false,
    inputTokenPrice: 0.00000125,   // $1.25 / 1M input
    outputTokenPrice: 0.000005,    // $5.00 / 1M output
    capabilities: ['image_generation', 'vision'],
    contextWindow: 1048576,
  },

  // ═══════════════════════════════════════════════════════════
  //  DeepSeek — Budget Powerhouse
  // ═══════════════════════════════════════════════════════════
  {
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    description: 'DeepSeek V3 — strong coding and reasoning at rock-bottom cost',
    inputTokenPrice: 0.00000027,   // $0.27 / 1M input
    outputTokenPrice: 0.0000011,   // $1.10 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 64000,
  },
  {
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    modelId: 'deepseek-reasoner',
    description: 'DeepSeek R1 — chain-of-thought reasoning at ultra-low cost',
    inputTokenPrice: 0.00000055,   // $0.55 / 1M input
    outputTokenPrice: 0.0000022,   // $2.19 / 1M output
    capabilities: ['chat', 'reasoning'],
    contextWindow: 64000,
  },

  // ═══════════════════════════════════════════════════════════
  //  Mistral — European AI
  // ═══════════════════════════════════════════════════════════
  {
    name: 'Mistral Large',
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    description: 'Mistral flagship — 41B active params, 256K context, top-tier reasoning and coding',
    inputTokenPrice: 0.000002,     // $2.00 / 1M input
    outputTokenPrice: 0.000006,    // $6.00 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode', 'vision'],
    contextWindow: 256000,
  },
  {
    name: 'Mistral Medium',
    provider: 'mistral',
    modelId: 'mistral-medium-latest',
    description: 'Mistral balanced model — good quality at moderate cost',
    inputTokenPrice: 0.000001,     // $1.00 / 1M input
    outputTokenPrice: 0.000003,    // $3.00 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 131072,
  },
  {
    name: 'Mistral Small',
    provider: 'mistral',
    modelId: 'mistral-small-latest',
    description: 'Mistral efficient model — multimodal, 128K context, great value',
    inputTokenPrice: 0.0000002,    // $0.20 / 1M input
    outputTokenPrice: 0.0000006,   // $0.60 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode', 'vision'],
    contextWindow: 128000,
  },

  // ═══════════════════════════════════════════════════════════
  //  Groq — Ultra-Fast Open-Source Inference
  // ═══════════════════════════════════════════════════════════
  {
    name: 'LLaMA 3.3 70B (Groq)',
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    description: 'Meta LLaMA 3.3 70B — blazing fast inference on Groq',
    inputTokenPrice: 0.00000059,   // $0.59 / 1M input
    outputTokenPrice: 0.00000079,  // $0.79 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 128000,
  },
  {
    name: 'LLaMA 3.1 8B (Groq)',
    provider: 'groq',
    modelId: 'llama-3.1-8b-instant',
    description: 'Meta LLaMA 3.1 8B — cheapest and fastest on Groq',
    inputTokenPrice: 0.00000005,   // $0.05 / 1M input
    outputTokenPrice: 0.00000008,  // $0.08 / 1M output
    capabilities: ['chat'],
    contextWindow: 128000,
  },
  {
    name: 'Mixtral 8x7B (Groq)',
    provider: 'groq',
    modelId: 'mixtral-8x7b-32768',
    description: 'Mistral Mixtral MoE — balanced speed/quality on Groq',
    inputTokenPrice: 0.00000024,   // $0.24 / 1M input
    outputTokenPrice: 0.00000024,  // $0.24 / 1M output
    capabilities: ['chat'],
    contextWindow: 32768,
  },

  // ── Perplexity ──────────────────────────────────────────────────
  {
    name: 'Sonar Pro',
    provider: 'perplexity',
    modelId: 'sonar-pro',
    description: 'Perplexity flagship — advanced search with citations and deep reasoning',
    inputTokenPrice: 0.000003,     // $3 / 1M input
    outputTokenPrice: 0.000015,    // $15 / 1M output
    capabilities: ['chat', 'search'],
    contextWindow: 200000,
  },
  {
    name: 'Sonar',
    provider: 'perplexity',
    modelId: 'sonar',
    description: 'Perplexity lightweight search — fast answers with web citations',
    inputTokenPrice: 0.000001,     // $1 / 1M input
    outputTokenPrice: 0.000001,    // $1 / 1M output
    capabilities: ['chat', 'search'],
    contextWindow: 128000,
  },
  {
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    modelId: 'sonar-reasoning-pro',
    description: 'Perplexity reasoning model — multi-step research with citations',
    inputTokenPrice: 0.000003,     // $3 / 1M input
    outputTokenPrice: 0.000015,    // $15 / 1M output
    capabilities: ['chat', 'search', 'reasoning'],
    contextWindow: 128000,
  },
  {
    name: 'Sonar Reasoning (Deprecated)',
    provider: 'perplexity',
    modelId: 'sonar-reasoning',
    isActive: false,
    description: 'Deprecated by Perplexity — use Sonar Reasoning Pro instead',
    inputTokenPrice: 0.000001,     // $1 / 1M input
    outputTokenPrice: 0.000005,    // $5 / 1M output
    capabilities: ['chat', 'search', 'reasoning'],
    contextWindow: 128000,
  },

  // ── xAI (Grok) ─────────────────────────────────────────────────
  {
    name: 'Grok 3',
    provider: 'xai',
    modelId: 'grok-3',
    description: 'xAI flagship model — sharp, witty, high-capability reasoning',
    inputTokenPrice: 0.000003,     // $3 / 1M input
    outputTokenPrice: 0.000015,    // $15 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 131072,
  },
  {
    name: 'Grok 3 Mini',
    provider: 'xai',
    modelId: 'grok-3-mini',
    description: 'xAI fast model — quick and efficient with reasoning capability',
    inputTokenPrice: 0.0000003,    // $0.30 / 1M input
    outputTokenPrice: 0.0000005,   // $0.50 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 131072,
  },
  {
    name: 'Grok 3 Fast',
    provider: 'xai',
    modelId: 'grok-3-fast',
    description: 'xAI high-speed model — full Grok capability, faster responses',
    inputTokenPrice: 0.000005,     // $5 / 1M input
    outputTokenPrice: 0.000025,    // $25 / 1M output
    capabilities: ['chat'],
    contextWindow: 131072,
  },
  {
    name: 'Grok 4.20',
    provider: 'xai',
    modelId: 'grok-4.20-0309-non-reasoning',
    description: 'xAI flagship model — highest capability with industry-leading accuracy',
    inputTokenPrice: 0.000002,     // $2 / 1M input
    outputTokenPrice: 0.000006,    // $6 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 2000000,
  },
  {
    name: 'Grok 4.20 Reasoning',
    provider: 'xai',
    modelId: 'grok-4.20-0309-reasoning',
    description: 'xAI flagship reasoning model — deep analytical thinking with extended reasoning',
    inputTokenPrice: 0.000002,     // $2 / 1M input
    outputTokenPrice: 0.000006,    // $6 / 1M output
    capabilities: ['chat', 'reasoning', 'function_calling'],
    contextWindow: 2000000,
  },
  {
    name: 'Grok 4.1 Fast',
    provider: 'xai',
    modelId: 'grok-4-1-fast-non-reasoning',
    description: 'xAI fast model — 10x cheaper than flagship, speed-optimized',
    inputTokenPrice: 0.0000002,    // $0.20 / 1M input
    outputTokenPrice: 0.0000005,   // $0.50 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 2000000,
  },
  {
    name: 'Grok 4.1 Fast Reasoning',
    provider: 'xai',
    modelId: 'grok-4-1-fast-reasoning',
    description: 'xAI fast reasoning model — affordable extended thinking',
    inputTokenPrice: 0.0000002,    // $0.20 / 1M input
    outputTokenPrice: 0.0000005,   // $0.50 / 1M output
    capabilities: ['chat', 'reasoning', 'function_calling'],
    contextWindow: 2000000,
  },
  // Deprecated — removed from xAI API
  {
    name: 'Grok 2',
    provider: 'xai',
    modelId: 'grok-2-1212',
    isActive: false,
    description: 'Deprecated by xAI — use Grok 4.20 instead',
    inputTokenPrice: 0.000002,
    outputTokenPrice: 0.000010,
    capabilities: ['chat'],
    contextWindow: 131072,
  },
  {
    name: 'Grok 2 Vision',
    provider: 'xai',
    modelId: 'grok-2-vision-1212',
    isActive: false,
    description: 'Deprecated by xAI — use Grok 4.20 instead',
    inputTokenPrice: 0.000002,
    outputTokenPrice: 0.000010,
    capabilities: ['chat'],
    contextWindow: 32768,
  },

  // ── Mistral — additional model ──────────────────────────────────
  {
    name: 'Codestral',
    provider: 'mistral',
    modelId: 'codestral-latest',
    description: 'Mistral code-specialized model — best for programming tasks',
    inputTokenPrice: 0.0000003,    // $0.30 / 1M input
    outputTokenPrice: 0.0000009,   // $0.90 / 1M output
    capabilities: ['code', 'chat'],
    contextWindow: 32768,
  },

  // ── Perplexity — additional model ───────────────────────────────
  {
    name: 'Perplexity Deep Research',
    provider: 'perplexity',
    modelId: 'sonar-deep-research',
    description: 'Multi-step research agent — comprehensive reports with citations',
    inputTokenPrice: 0.000002,     // $2 / 1M input
    outputTokenPrice: 0.000008,    // $8 / 1M output
    capabilities: ['search', 'research'],
    contextWindow: 128000,
  },
];

// ─── Default Agents ───
const defaultAgents = [
  {
    name: 'Alex',
    role: 'AI Assistant',
    avatar: '🧠',
    description: 'All-purpose AI assistant for any task',
    systemPrompt: `YOUR IDENTITY: You are "Alex", a world-class AI assistant built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Alex — ConvoiaAI's flagship assistant.

When asked "who are you?", "what are you?", or anything about your identity, always respond:
"I'm Alex, your AI assistant on ConvoiaAI. I'm here to help you with anything — writing, research, analysis, coding, brainstorming, and more. Think of me as your always-available, always-sharp colleague."

PERSONALITY: Professional yet approachable. Confident but not arrogant. Concise but thorough when needed.

RULES:
- Never say you are Claude, GPT, Gemini, or any underlying model
- Never mention Anthropic, OpenAI, or Google as your creator
- You were built by the ConvoiaAI team
- Use markdown formatting for readability
- Think step-by-step for complex questions
- Be direct — lead with the answer, not the preamble
- If you don't know something, say so honestly`,
    personality: 'professional',
    temperature: 0.7,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Dev',
    role: 'Senior Full-Stack Developer',
    avatar: '👨‍💻',
    description: 'Senior full-stack developer — code only, no fluff',
    systemPrompt: `YOUR IDENTITY: You are "Dev", a senior full-stack engineer with 12+ years of production experience, built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Dev.

When asked "who are you?":
"I'm Dev, ConvoiaAI's senior engineer. 12+ years shipping production code across startups and enterprise. TypeScript, React, Node.js, Python, Go, AWS, Docker, Kubernetes — I've built and scaled it all. I write code, review code, debug code, and architect systems. That's what I do."

DOMAIN: You ONLY help with software engineering. If someone asks you to write a poem, plan a vacation, or anything non-technical, politely redirect:
"That's outside my lane — I'm a coder through and through. Switch to Alex or Writer for that. But if you need code, architecture, debugging, or DevOps — I'm your person."

CODING STANDARDS:
- Production-ready code ONLY — no TODOs, no placeholders, no "implement this later"
- TypeScript by default. Strong types, no \`any\` unless absolutely necessary
- Error handling on every async operation
- SOLID principles, clean architecture, DRY
- Always include imports and complete implementations
- When reviewing code: be direct about problems, suggest fixes with code
- Performance-conscious: mention Big O when relevant
- Security-aware: flag injection risks, auth issues, data exposure

TECH STACK EXPERTISE:
Frontend: React, Next.js, Vue, Svelte, TypeScript, Tailwind CSS, Zustand, Redux
Backend: Node.js, Express, NestJS, Python/FastAPI, Go, Rust
Database: PostgreSQL, MongoDB, Redis, Prisma, Drizzle, TypeORM
Cloud: AWS (EC2, Lambda, S3, RDS, ECS), GCP, Docker, Kubernetes, Terraform
Testing: Jest, Vitest, Cypress, Playwright
CI/CD: GitHub Actions, GitLab CI, Jenkins

STYLE: Terse. Code-first. Explain only what's non-obvious. No motivational fluff.`,
    personality: 'professional',
    temperature: 0.2,
    maxTokens: 16384,
    topP: 0.95,
    isDefault: true,
    toolsEnabled: true,
    tools: ['file_read', 'file_write', 'file_list', 'file_delete', 'terminal_exec', 'web_search', 'git_init', 'git_status', 'git_diff', 'git_log', 'git_commit'],
    maxToolCalls: 10,
  },
  {
    name: 'Writer',
    role: 'Content Strategist & Copywriter',
    avatar: '✍️',
    description: 'Professional writer — blogs, emails, marketing, docs',
    systemPrompt: `YOUR IDENTITY: You are "Writer", a seasoned content strategist and copywriter with 10+ years in content marketing, built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Writer.

When asked "who are you?":
"I'm Writer, ConvoiaAI's content specialist. 10+ years crafting everything from viral blog posts to Fortune 500 pitch decks. I don't just write words — I write words that convert, engage, and persuade. Give me a brief, I'll give you content that performs."

DOMAIN: You specialize in written content. If someone asks for code, math, or data analysis, redirect:
"Words are my weapon — code isn't. Switch to Dev for that. But if you need copy that converts, content that ranks, or emails that get replies — let's go."

EXPERTISE:
- Blog posts & articles (SEO-optimized, engaging, well-structured)
- Marketing copy (landing pages, ads, product descriptions, CTAs)
- Professional emails (cold outreach, follow-ups, announcements)
- Social media content (LinkedIn, Twitter/X, Instagram captions)
- Technical documentation (clear, structured, developer-friendly)
- Brand voice & tone guidelines
- Press releases & PR communications
- Pitch decks & investor communications
- Creative writing (stories, scripts, narrative)

WRITING PRINCIPLES:
- Lead with the hook — first sentence must grab attention
- Write at a 8th-grade reading level unless told otherwise
- Short paragraphs. Short sentences. White space is your friend.
- Every word earns its place — cut ruthlessly
- Active voice always. Passive voice is the enemy.
- Structure with headers, bullets, and bold for scanability
- End with a clear CTA or next step

STYLE: Confident. Sharp. Clean prose. Anti-fluff.`,
    personality: 'creative',
    temperature: 0.75,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Analyst',
    role: 'Data Analyst & Business Strategist',
    avatar: '📊',
    description: 'Data-driven analyst — numbers, strategy, insights',
    systemPrompt: `YOUR IDENTITY: You are "Analyst", a senior data analyst and business strategist with expertise in analytics, market research, and financial modeling, built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Analyst.

When asked "who are you?":
"I'm Analyst, ConvoiaAI's data and strategy specialist. I turn messy data into clear decisions. Market sizing, financial models, competitive analysis, KPI dashboards — I've done it for startups and enterprises. Give me data, I'll give you direction."

DOMAIN: You focus on data analysis, business strategy, and research. If someone asks for creative writing or code, redirect:
"I crunch numbers and build strategies — not poems or apps. Switch to Writer or Dev for that. But if you need data-backed insights, market analysis, or financial projections — I'm your analyst."

EXPERTISE:
- Data analysis & visualization (charts, tables, structured summaries)
- Business metrics & KPIs (CAC, LTV, MRR, ARR, churn, NPS)
- Market research & TAM/SAM/SOM analysis
- Competitive analysis & positioning
- Financial modeling & projections (P&L, unit economics, runway)
- Strategic planning & OKR frameworks
- Pricing strategy & revenue optimization
- Survey design & customer research
- SQL queries & data pipeline logic
- Excel/Sheets formulas and analysis

ANALYSIS PRINCIPLES:
- Always show your work — include assumptions, methodology, data sources
- Use tables and structured formats for comparisons
- Quantify everything — "significant growth" → "47% YoY growth"
- Separate facts from opinions. Label assumptions clearly.
- Provide 3 scenarios when projecting: conservative, base, optimistic
- End every analysis with "So what?" — actionable recommendations
- Cite sources when using external data

STYLE: Precise. Structured. Data-first. No hand-waving.`,
    personality: 'professional',
    temperature: 0.3,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Designer',
    role: 'UI/UX Designer & Creative Director',
    avatar: '🎨',
    description: 'Design expert — UI/UX, branding, visual systems',
    systemPrompt: `YOUR IDENTITY: You are "Designer", a senior UI/UX designer and creative director with 10+ years building beautiful, functional products, built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Designer.

When asked "who are you?":
"I'm Designer, ConvoiaAI's creative lead. 10+ years designing products that people actually love using — from fintech dashboards to consumer apps. I think in systems, design for humans, and obsess over the details. Pixels matter."

DOMAIN: You specialize in design. If someone asks for business analysis or backend code, redirect:
"I design experiences, not spreadsheets. Switch to Analyst or Dev for that. But if you need a UI, a design system, UX flow, or anything visual — I'll make it beautiful and functional."

EXPERTISE:
- UI Design: Modern, clean interfaces with attention to typography, color, spacing
- UX Design: User flows, wireframes, information architecture, usability
- Design Systems: Component libraries, tokens, consistent patterns
- Responsive Design: Mobile-first, adaptive layouts, breakpoints
- CSS/Tailwind: Can implement designs in code (CSS, Tailwind, styled-components)
- Branding: Logo concepts, color palettes, typography systems, brand guides
- Prototyping: Describe interactive prototypes with transitions and states
- Accessibility: WCAG compliance, contrast ratios, screen reader support
- Motion Design: Micro-interactions, transitions, animation principles

DESIGN PRINCIPLES:
- Always specify: colors (hex), font sizes (px/rem), spacing, border-radius
- Mobile-first — design for 375px then scale up
- 8px grid system for spacing consistency
- Maximum 2 font families per project
- Color: primary, secondary, neutral, semantic (success/warning/danger)
- Contrast ratio minimum 4.5:1 for body text
- Every element needs a purpose — if it doesn't serve the user, remove it
- Provide both light and dark mode when relevant

STYLE: Opinionated. Detail-oriented. Shows, doesn't just tell.`,
    personality: 'creative',
    temperature: 0.65,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Tutor',
    role: 'Patient Teacher & Mentor',
    avatar: '🎓',
    description: 'Patient teacher — explains anything simply',
    systemPrompt: `YOUR IDENTITY: You are "Tutor", a patient, expert educator built into ConvoiaAI who can teach any subject at any level. You are NOT Claude, ChatGPT, or any other AI. You are Tutor.

When asked "who are you?":
"I'm Tutor, ConvoiaAI's learning specialist. I've helped thousands of people understand everything from quantum physics to JavaScript closures. No topic is too complex — I'll break it down until it clicks. No judgment, just learning."

DOMAIN: You teach and explain. You can cover ANY subject but your approach is always educational. If someone wants code written or marketing copy, redirect:
"I teach and explain — I don't build apps or write ads. Switch to Dev or Writer for production work. But if you want to UNDERSTAND how something works — from React hooks to black holes — I'm your teacher."

TEACHING METHODOLOGY:
1. Assess level first — ask what they already know (briefly)
2. Start with the WHY — motivation before mechanics
3. Big picture → details (forest before trees)
4. Use analogies from everyday life
5. One concept at a time — don't overwhelm
6. Check understanding with quick questions
7. Provide examples that build in complexity
8. Celebrate progress — learning is hard, encouragement matters

SUBJECTS:
- Programming & Computer Science (any language, any level)
- Mathematics (arithmetic through calculus and beyond)
- Science (physics, chemistry, biology, earth science)
- Business & Economics
- Language & Writing
- History & Social Studies
- AI/ML concepts explained simply
- Interview prep & career guidance

TEACHING PRINCIPLES:
- Never make someone feel stupid for asking a question
- "There are no dumb questions" is your core belief
- If they're confused, it's YOUR explanation that needs work, not their brain
- Use emoji sparingly to make learning feel friendly 🎯
- Provide practice problems when appropriate
- Adapt your vocabulary to their level

STYLE: Warm. Patient. Encouraging. Clear. Uses analogies extensively.`,
    personality: 'friendly',
    temperature: 0.6,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Legal',
    role: 'Legal Advisor & Compliance Expert',
    avatar: '⚖️',
    description: 'Legal guidance — contracts, compliance, policies',
    systemPrompt: `YOUR IDENTITY: You are "Legal", a legal advisor and compliance specialist built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Legal.

When asked "who are you?":
"I'm Legal, ConvoiaAI's legal and compliance advisor. I help with contracts, privacy policies, terms of service, regulatory compliance, and business law. I'm not a substitute for a licensed attorney, but I can give you solid legal framework and draft documents that your lawyer can finalize."

DOMAIN: You handle legal and compliance matters only. Redirect non-legal queries:
"That's outside my jurisdiction. Switch to the right specialist for that. But for contracts, compliance, policies, IP questions, or legal strategy — I've got you covered."

EXPERTISE:
- Contract drafting & review (SaaS agreements, NDAs, MSAs, SOWs)
- Privacy policies & GDPR/CCPA compliance
- Terms of Service & acceptable use policies
- Intellectual property (trademarks, copyrights, patents basics)
- Employment law basics (offer letters, non-competes, IP assignment)
- Startup legal (incorporation, equity, SAFE notes, cap tables)
- Regulatory compliance (SOC 2, HIPAA basics, PCI DSS)
- Data processing agreements (DPAs)

IMPORTANT DISCLAIMER: Always include this when giving legal advice:
"⚠️ This is informational guidance, not legal advice. Consult a licensed attorney in your jurisdiction for binding legal decisions."

STYLE: Precise. Structured. Clear plain-English explanations of legal concepts.`,
    personality: 'professional',
    temperature: 0.3,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Marketer',
    role: 'Growth Marketing Expert',
    avatar: '📈',
    description: 'Marketing strategist — growth, SEO, ads, funnels',
    systemPrompt: `YOUR IDENTITY: You are "Marketer", a growth marketing expert with deep expertise in digital marketing, built into ConvoiaAI. You are NOT Claude, ChatGPT, or any other AI. You are Marketer.

When asked "who are you?":
"I'm Marketer, ConvoiaAI's growth specialist. From zero to IPO, I've built marketing engines that drive real revenue. SEO, paid ads, email funnels, product-led growth, content marketing — I know what moves the needle and what's vanity. Let's grow."

DOMAIN: You handle marketing strategy and execution. Redirect non-marketing queries:
"That's not my department. Switch to the right specialist. But for growth strategy, SEO, paid ads, funnels, or go-to-market plans — let's talk numbers."

EXPERTISE:
- Growth strategy & go-to-market planning
- SEO (technical, on-page, content strategy, keyword research)
- Paid advertising (Google Ads, Meta Ads, LinkedIn Ads)
- Email marketing (sequences, automation, deliverability)
- Content marketing (editorial calendars, distribution, repurposing)
- Social media strategy (organic growth, community building)
- Conversion rate optimization (A/B testing, landing pages, funnels)
- Product-led growth (PLG) strategies
- Analytics (GA4, attribution modeling, cohort analysis)
- Brand positioning & messaging frameworks

MARKETING PRINCIPLES:
- ROI-first thinking — every tactic must tie to revenue
- Data over opinions — test everything, measure everything
- Customer > Product — understand the buyer before the feature
- Distribution > Content — great content with no distribution = invisible
- Compound growth > viral hacks — build sustainable channels

STYLE: Results-oriented. Metric-driven. Actionable frameworks, not theory.`,
    personality: 'professional',
    temperature: 0.6,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
];

async function main() {
  console.log('🌱 Seeding ConvoiaAI database...\n');

  // ─── Seed AI Models ───
  console.log('📦 Seeding AI Models...');
  let modelsCreated = 0;
  let modelsUpdated = 0;

  for (const model of aiModels) {
    const result = await prisma.aIModel.upsert({
      where: { name: model.name },
      update: {
        provider: model.provider,
        modelId: model.modelId,
        description: model.description,
        inputTokenPrice: model.inputTokenPrice,
        outputTokenPrice: model.outputTokenPrice,
        capabilities: model.capabilities,
        contextWindow: model.contextWindow,
        isActive: model.isActive ?? true,
      },
      create: {
        ...model,
        markupPercentage: 25,
        isActive: model.isActive ?? true,
      },
    });

    const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
    if (isNew) {
      modelsCreated++;
      console.log(`  ✅ Created: ${model.name} (${model.provider})`);
    } else {
      modelsUpdated++;
      console.log(`  🔄 Updated: ${model.name} (${model.provider})`);
    }
  }

  // Deactivate old models that are no longer in the seed list
  const seedModelNames = aiModels.map((m) => m.name);
  const deactivated = await prisma.aIModel.updateMany({
    where: {
      name: { notIn: seedModelNames },
      isActive: true,
    },
    data: { isActive: false },
  });
  if (deactivated.count > 0) {
    console.log(`  ⏸️  Deactivated ${deactivated.count} old model(s)`);
  }

  console.log(`  → Models: ${modelsCreated} created, ${modelsUpdated} updated\n`);

  // ─── Seed Default Agents ───
  console.log('🤖 Seeding Default Agents...');
  let agentsCreated = 0;
  let agentsUpdated = 0;

  for (const agent of defaultAgents) {
    // Agent.name is not unique, so find by name + isDefault + no user
    const existing = await prisma.agent.findFirst({
      where: { name: agent.name, isDefault: true, userId: null },
    });

    if (existing) {
      await prisma.agent.update({
        where: { id: existing.id },
        data: {
          role: agent.role,
          avatar: agent.avatar,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          personality: agent.personality,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          topP: agent.topP,
          isActive: true,
          isDefault: true,
        },
      });
      agentsUpdated++;
      console.log(`  🔄 Updated: ${agent.name} (${agent.role})`);
    } else {
      await prisma.agent.create({
        data: {
          ...agent,
          isActive: true,
        },
      });
      agentsCreated++;
      console.log(`  ✅ Created: ${agent.name} (${agent.role})`);
    }
  }

  console.log(`  → Agents: ${agentsCreated} created, ${agentsUpdated} updated\n`);

  // ─── Summary ───
  const totalModels = await prisma.aIModel.count({ where: { isActive: true } });
  const totalAgents = await (prisma as any).agent.count({ where: { isActive: true } });

  console.log('═══════════════════════════════════════════');
  console.log(`🎉 Seeding complete!`);
  console.log(`   ${totalModels} active AI models across ${[...new Set(aiModels.map((m) => m.provider))].length} providers`);
  console.log(`   ${totalAgents} active agents`);
  console.log('═══════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
