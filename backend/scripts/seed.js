import prisma from '../src/config/db.js';
import logger from '../config/logger.js';
const seedAIModels = async () => {
    const models = [
        // OpenAI models
        {
            name: 'GPT-4 Turbo',
            modelId: 'gpt-4-turbo',
            provider: 'openai',
            inputTokenPrice: 0.01,
            outputTokenPrice: 0.03,
            capabilities: ['text', 'vision', 'function_calling'],
            contextWindow: 128000,
        },
        {
            name: 'GPT-4',
            modelId: 'gpt-4',
            provider: 'openai',
            inputTokenPrice: 0.03,
            outputTokenPrice: 0.06,
            capabilities: ['text'],
            contextWindow: 8192,
        },
        {
            name: 'GPT-3.5 Turbo',
            modelId: 'gpt-3.5-turbo',
            provider: 'openai',
            inputTokenPrice: 0.0005,
            outputTokenPrice: 0.0015,
            capabilities: ['text'],
            contextWindow: 4096,
        },
        // Anthropic models
        {
            name: 'Claude 3 Opus',
            modelId: 'claude-3-opus',
            provider: 'anthropic',
            inputTokenPrice: 0.015,
            outputTokenPrice: 0.075,
            capabilities: ['text', 'vision'],
            contextWindow: 200000,
        },
        {
            name: 'Claude 3 Sonnet',
            modelId: 'claude-3-sonnet',
            provider: 'anthropic',
            inputTokenPrice: 0.003,
            outputTokenPrice: 0.015,
            capabilities: ['text'],
            contextWindow: 200000,
        },
        {
            name: 'Claude 3 Haiku',
            modelId: 'claude-3-haiku',
            provider: 'anthropic',
            inputTokenPrice: 0.00025,
            outputTokenPrice: 0.00125,
            capabilities: ['text'],
            contextWindow: 200000,
        },
        // Google models
        {
            name: 'Gemini Pro',
            modelId: 'gemini-pro',
            provider: 'google',
            inputTokenPrice: 0.000125,
            outputTokenPrice: 0.000375,
            capabilities: ['text'],
            contextWindow: 32000,
        },
        {
            name: 'Gemini Pro Vision',
            modelId: 'gemini-pro-vision',
            provider: 'google',
            inputTokenPrice: 0.0025,
            outputTokenPrice: 0.0075,
            capabilities: ['text', 'vision'],
            contextWindow: 12000,
        },
        // Mistral models
        {
            name: 'Mistral Large',
            modelId: 'mistral-large',
            provider: 'mistral',
            inputTokenPrice: 0.008,
            outputTokenPrice: 0.024,
            capabilities: ['text'],
            contextWindow: 32000,
        },
        {
            name: 'Mistral Medium',
            modelId: 'mistral-medium',
            provider: 'mistral',
            inputTokenPrice: 0.0027,
            outputTokenPrice: 0.0081,
            capabilities: ['text'],
            contextWindow: 32000,
        },
        // DeepSeek models
        {
            name: 'DeepSeek Coder',
            modelId: 'deepseek-coder',
            provider: 'deepseek',
            inputTokenPrice: 0.0008,
            outputTokenPrice: 0.0016,
            capabilities: ['text'],
            contextWindow: 4096,
        },
    ];
    for (const model of models) {
        try {
            const existingModel = await prisma.aIModel.findFirst({
                where: { modelId: model.modelId },
            });
            if (!existingModel) {
                await prisma.aIModel.create({
                    data: model,
                });
                logger.info(`✅ Created model: ${model.name}`);
            }
            else {
                logger.info(`⏭️  Model already exists: ${model.name}`);
            }
        }
        catch (error) {
            logger.error(`❌ Failed to create model ${model.name}:`, error);
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
    }
    catch (error) {
        logger.error('❌ Seed failed:', error);
        process.exit(1);
    }
};
main();
//# sourceMappingURL=seed.js.map