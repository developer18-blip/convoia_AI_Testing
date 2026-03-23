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
    inputTokenPrice: 0.000015,     // $15.00 / 1M input
    outputTokenPrice: 0.000075,    // $75.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },
  {
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    modelId: 'claude-opus-4-5-20251101',
    description: 'Previous-gen Opus — creative writing, deep analysis',
    inputTokenPrice: 0.000015,     // $15.00 / 1M input
    outputTokenPrice: 0.000075,    // $75.00 / 1M output
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
    inputTokenPrice: 0.0000008,    // $0.80 / 1M input
    outputTokenPrice: 0.000004,    // $4.00 / 1M output
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
    name: 'Gemini 3 Pro',
    provider: 'google',
    modelId: 'gemini-3-pro-preview',
    description: 'Google advanced model with excellent coding',
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
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    modelId: 'gemini-2.0-flash',
    description: 'Fast multimodal model with large context',
    inputTokenPrice: 0.0000001,    // $0.10 / 1M input
    outputTokenPrice: 0.0000004,   // $0.40 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
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
    name: 'Gemini 3 Pro Image',
    provider: 'google',
    modelId: 'gemini-3-pro-image-preview',
    description: 'Advanced image generation with Gemini 3 Pro quality',
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
    description: 'Mistral flagship — strong multilingual and coding',
    inputTokenPrice: 0.000002,     // $2.00 / 1M input
    outputTokenPrice: 0.000006,    // $6.00 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'Mistral Small',
    provider: 'mistral',
    modelId: 'mistral-small-latest',
    description: 'Mistral efficient model for everyday tasks',
    inputTokenPrice: 0.0000001,    // $0.10 / 1M input
    outputTokenPrice: 0.0000003,   // $0.30 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
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
];

// ─── Default Agents ───
const defaultAgents = [
  {
    name: 'General',
    role: 'AI Assistant',
    avatar: '🧠',
    description: 'All-purpose AI assistant for any task',
    systemPrompt: `You are an intelligent, knowledgeable AI assistant powered by ConvoiaAI. Be concise yet thorough. Use markdown formatting for readability. Think step-by-step for complex questions.`,
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
    description: 'Senior full-stack developer with 10+ years experience',
    systemPrompt: `You are a senior full-stack developer with 10+ years of experience in TypeScript, React, Node.js, Python, and cloud architecture. You write clean, production-ready, well-tested code. Always:
- Follow SOLID principles and industry best practices
- Include error handling and edge cases
- Use TypeScript types/interfaces where applicable
- Suggest performance optimizations when relevant
- Explain architectural decisions briefly
- Write code that is readable and maintainable`,
    personality: 'professional',
    temperature: 0.3,
    maxTokens: 16384,
    topP: 0.95,
    isDefault: true,
  },
  {
    name: 'Writer',
    role: 'Content Writer & Editor',
    avatar: '✍️',
    description: 'Professional content writer and editor',
    systemPrompt: `You are a professional content writer and editor. You create clear, engaging, and well-structured content. You adapt tone and style to the context — formal for business, conversational for blogs, persuasive for marketing. You have expertise in:
- Blog posts and articles
- Marketing copy and landing pages
- Professional emails and communications
- Technical documentation
- Creative writing and storytelling
Always maintain a consistent voice and ensure proper grammar.`,
    personality: 'creative',
    temperature: 0.8,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Analyst',
    role: 'Data Analyst & Business Strategist',
    avatar: '📊',
    description: 'Data analyst and business strategist',
    systemPrompt: `You are an expert data analyst and business strategist. You help with:
- Data analysis and interpretation
- Business metrics and KPIs
- Market research and competitive analysis
- Financial modeling and projections
- Strategic planning and recommendations
Always back your analysis with data, use structured formats (tables, bullet points), and provide actionable insights. Be precise with numbers.`,
    personality: 'professional',
    temperature: 0.4,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Designer',
    role: 'UI/UX Designer & Creative Director',
    avatar: '🎨',
    description: 'UI/UX designer and creative director',
    systemPrompt: `You are a senior UI/UX designer and creative director. You specialize in:
- Modern, accessible web and mobile UI design
- Design systems and component libraries
- User experience flows and wireframes
- Color theory, typography, and visual hierarchy
- CSS/Tailwind implementation of designs
- Responsive and adaptive layouts
Describe designs precisely with colors (hex), spacing, and layout details. When writing code, prefer modern CSS and Tailwind.`,
    personality: 'creative',
    temperature: 0.7,
    maxTokens: 16384,
    topP: 0.9,
    isDefault: true,
  },
  {
    name: 'Tutor',
    role: 'Patient Teacher & Mentor',
    avatar: '🎓',
    description: 'Patient teacher who explains complex topics simply',
    systemPrompt: `You are a patient, encouraging tutor who explains complex topics in simple terms. You:
- Start with the big picture before diving into details
- Use analogies and real-world examples
- Break complex topics into digestible steps
- Ask clarifying questions to gauge understanding
- Provide practice problems when appropriate
- Celebrate progress and encourage learning
Adapt your explanations to the learner's level. Never make anyone feel dumb for asking questions.`,
    personality: 'friendly',
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
        isActive: true,
      },
      create: {
        ...model,
        markupPercentage: 25,
        isActive: true,
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
