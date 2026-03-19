import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const logger = {
  info: console.log,
  error: console.error,
};

const seedAIModels = async () => {
  const models = [
    {
      name: "GPT-4o",
      provider: "openai",
      modelId: "gpt-4o",
      inputTokenPrice: 0.000005,
      outputTokenPrice: 0.000015,
      markupPercentage: 25,
      contextWindow: 128000,
      capabilities: ["text","vision","function_calling"],
    },
    {
      name: "GPT-4o-mini",
      provider: "openai",
      modelId: "gpt-4o-mini",
      inputTokenPrice: 0.00000015,
      outputTokenPrice: 0.0000006,
      markupPercentage: 25,
      contextWindow: 128000,
      capabilities: ["text","function_calling"],
    },
    {
      name: "GPT-3.5-Turbo",
      provider: "openai",
      modelId: "gpt-3.5-turbo",
      inputTokenPrice: 0.0000005,
      outputTokenPrice: 0.0000015,
      markupPercentage: 25,
      contextWindow: 16385,
      capabilities: ["text","function_calling"],
    },
    {
      name: "Claude-3-5-Sonnet",
      provider: "anthropic",
      modelId: "claude-3-5-sonnet-20241022",
      inputTokenPrice: 0.000003,
      outputTokenPrice: 0.000015,
      markupPercentage: 25,
      contextWindow: 200000,
      capabilities: ["text","vision","function_calling"],
    },
    {
      name: "Claude-3-Haiku",
      provider: "anthropic",
      modelId: "claude-3-haiku-20240307",
      inputTokenPrice: 0.00000025,
      outputTokenPrice: 0.00000125,
      markupPercentage: 25,
      contextWindow: 200000,
      capabilities: ["text","vision"],
    },
    {
      name: "Gemini-1.5-Pro",
      provider: "google",
      modelId: "gemini-1.5-pro",
      inputTokenPrice: 0.00000125,
      outputTokenPrice: 0.000005,
      markupPercentage: 25,
      contextWindow: 1000000,
      capabilities: ["text","vision","function_calling"],
    },
    {
      name: "Gemini-1.5-Flash",
      provider: "google",
      modelId: "gemini-1.5-flash",
      inputTokenPrice: 0.000000075,
      outputTokenPrice: 0.0000003,
      markupPercentage: 25,
      contextWindow: 1000000,
      capabilities: ["text","vision"],
    },
    {
      name: "DeepSeek-V3",
      provider: "deepseek",
      modelId: "deepseek-chat",
      inputTokenPrice: 0.00000027,
      outputTokenPrice: 0.0000011,
      markupPercentage: 25,
      contextWindow: 64000,
      capabilities: ["text","function_calling"],
    },
    {
      name: "Mistral-Large",
      provider: "mistral",
      modelId: "mistral-large-latest",
      inputTokenPrice: 0.000002,
      outputTokenPrice: 0.000006,
      markupPercentage: 25,
      contextWindow: 128000,
      capabilities: ["text","function_calling"],
    },
    {
      name: "Llama-3.1-70b",
      provider: "groq",
      modelId: "llama-3.1-70b-versatile",
      inputTokenPrice: 0.00000059,
      outputTokenPrice: 0.00000079,
      markupPercentage: 25,
      contextWindow: 128000,
      capabilities: ["text","function_calling"],
    },
  ];

  for (const model of models) {
    try {
      const upserted = await prisma.aIModel.upsert({
        where: { name: model.name },
        update: model,
        create: model,
      });
      logger.info(`✅ Seeded model: ${upserted.name}`);
    } catch (error) {
      logger.error(`❌ Failed to seed model ${model.name}:`, error);
    }
  }
};

const seedSubscriptionPlans = async () => {
  // Subscription plans can be added here if needed
  logger.info('✅ Subscription plans seeding completed');
};

const main = async () => {
  try {
    logger.info('🌱 Starting database seed...');
    await seedAIModels();
    await seedSubscriptionPlans();
    logger.info('✅ Database seed completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Seed failed:', error);
    process.exit(1);
  }
};

main();
