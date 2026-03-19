import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * AI Model seed data — real model IDs with approximate per-token pricing (USD).
 * Prices are provider cost; the 25% markup is applied dynamically at query time.
 */
const aiModels = [
  // ─── OpenAI ───
  {
    name: 'GPT-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    description: 'OpenAI flagship multimodal model — fast, smart, affordable',
    inputTokenPrice: 0.0000025,   // $2.50 / 1M input
    outputTokenPrice: 0.000010,   // $10.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'GPT-4o Mini',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    description: 'Small, fast, cheap — great for simple tasks',
    inputTokenPrice: 0.00000015,  // $0.15 / 1M input
    outputTokenPrice: 0.0000006,  // $0.60 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'GPT-4 Turbo',
    provider: 'openai',
    modelId: 'gpt-4-turbo',
    description: 'Previous-gen GPT-4 with vision and 128k context',
    inputTokenPrice: 0.000010,    // $10.00 / 1M input
    outputTokenPrice: 0.000030,   // $30.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    modelId: 'gpt-3.5-turbo',
    description: 'Fast and affordable for straightforward tasks',
    inputTokenPrice: 0.0000005,   // $0.50 / 1M input
    outputTokenPrice: 0.0000015,  // $1.50 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 16385,
  },

  // ─── Anthropic ───
  {
    name: 'Claude 4 Sonnet',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    description: 'Anthropic latest balanced model — excellent reasoning',
    inputTokenPrice: 0.000003,    // $3.00 / 1M input
    outputTokenPrice: 0.000015,   // $15.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },
  {
    name: 'Claude 4.5 Haiku',
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    description: 'Fastest Anthropic model — great for high-volume tasks',
    inputTokenPrice: 0.0000008,   // $0.80 / 1M input
    outputTokenPrice: 0.000004,   // $4.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling'],
    contextWindow: 200000,
  },

  // ─── Google ───
  {
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    modelId: 'gemini-2.0-flash',
    description: 'Google fast multimodal model with large context',
    inputTokenPrice: 0.0000001,   // $0.10 / 1M input
    outputTokenPrice: 0.0000004,  // $0.40 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 1048576,
  },
  {
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    modelId: 'gemini-1.5-pro',
    description: 'Google advanced reasoning model with 2M context',
    inputTokenPrice: 0.00000125,  // $1.25 / 1M input
    outputTokenPrice: 0.000005,   // $5.00 / 1M output
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
    contextWindow: 2097152,
  },

  // ─── DeepSeek ───
  {
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    description: 'DeepSeek V3 — strong coding and reasoning at low cost',
    inputTokenPrice: 0.00000027,  // $0.27 / 1M input
    outputTokenPrice: 0.0000011,  // $1.10 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 64000,
  },
  {
    name: 'DeepSeek Reasoner',
    provider: 'deepseek',
    modelId: 'deepseek-reasoner',
    description: 'DeepSeek R1 — chain-of-thought reasoning model',
    inputTokenPrice: 0.00000055,  // $0.55 / 1M input
    outputTokenPrice: 0.0000022,  // $2.19 / 1M output
    capabilities: ['chat', 'reasoning'],
    contextWindow: 64000,
  },

  // ─── Mistral ───
  {
    name: 'Mistral Large',
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    description: 'Mistral flagship — strong multilingual and coding',
    inputTokenPrice: 0.000002,    // $2.00 / 1M input
    outputTokenPrice: 0.000006,   // $6.00 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },
  {
    name: 'Mistral Small',
    provider: 'mistral',
    modelId: 'mistral-small-latest',
    description: 'Mistral efficient model for everyday tasks',
    inputTokenPrice: 0.0000001,   // $0.10 / 1M input
    outputTokenPrice: 0.0000003,  // $0.30 / 1M output
    capabilities: ['chat', 'function_calling', 'json_mode'],
    contextWindow: 128000,
  },

  // ─── Groq (hosted open-source — ultra-fast inference) ───
  {
    name: 'LLaMA 3.3 70B (Groq)',
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    description: 'Meta LLaMA 3.3 70B on Groq — blazing fast inference',
    inputTokenPrice: 0.00000059,  // $0.59 / 1M input
    outputTokenPrice: 0.00000079, // $0.79 / 1M output
    capabilities: ['chat', 'function_calling'],
    contextWindow: 128000,
  },
  {
    name: 'LLaMA 3.1 8B (Groq)',
    provider: 'groq',
    modelId: 'llama-3.1-8b-instant',
    description: 'Meta LLaMA 3.1 8B on Groq — cheapest and fastest',
    inputTokenPrice: 0.00000005,  // $0.05 / 1M input
    outputTokenPrice: 0.00000008, // $0.08 / 1M output
    capabilities: ['chat'],
    contextWindow: 128000,
  },
  {
    name: 'Mixtral 8x7B (Groq)',
    provider: 'groq',
    modelId: 'mixtral-8x7b-32768',
    description: 'Mistral Mixtral MoE on Groq — balanced speed/quality',
    inputTokenPrice: 0.00000024,  // $0.24 / 1M input
    outputTokenPrice: 0.00000024, // $0.24 / 1M output
    capabilities: ['chat'],
    contextWindow: 32768,
  },
];

async function main() {
  console.log('🌱 Seeding AI models...\n');

  let created = 0;
  let updated = 0;

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
      created++;
      console.log(`  ✅ Created: ${model.name} (${model.provider})`);
    } else {
      updated++;
      console.log(`  🔄 Updated: ${model.name} (${model.provider})`);
    }
  }

  console.log(`\n🎉 Seeding complete: ${created} created, ${updated} updated`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
