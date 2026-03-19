import prisma from '../config/db';

export async function estimateCost(modelId: string, inputText: string) {
  const estimatedTokens = Math.ceil(inputText.length / 4);
  const model = await prisma.aIModel.findUnique({ where: { id: modelId } });
  if (!model) throw new Error('Model not found');
  const providerCost = (estimatedTokens * model.inputTokenPrice);
  const customerPrice = providerCost * (1 + model.markupPercentage / 100);
  const savings = customerPrice - providerCost;
  return { estimatedTokens, providerCost, customerPrice, savings };
}

export async function calculateActualCost(modelId: string, inputTokens: number, outputTokens: number) {
  const model = await prisma.aIModel.findUnique({ where: { id: modelId } });
  if (!model) throw new Error('Model not found');
  const providerCost = (inputTokens * model.inputTokenPrice) + (outputTokens * model.outputTokenPrice);
  const customerPrice = providerCost * (1 + model.markupPercentage / 100);
  const profit = customerPrice - providerCost;
  return { providerCost, customerPrice, profit, markupPercentage: model.markupPercentage };
}

export async function recommendCheaperModel(modelId: string, inputText: string) {
  const estimatedTokens = Math.ceil(inputText.length / 4);
  const model = await prisma.aIModel.findUnique({ where: { id: modelId } });
  if (!model) throw new Error('Model not found');
  let recommendedModel = null;
  let reason = '';
  if ((model.name === 'gpt-4o' || model.name === 'Claude-3-5-Sonnet') && estimatedTokens < 500) {
    recommendedModel = await prisma.aIModel.findFirst({
      where: {
        inputTokenPrice: { lt: model.inputTokenPrice },
        outputTokenPrice: { lt: model.outputTokenPrice }
      },
      orderBy: { inputTokenPrice: 'asc' }
    });
    reason = 'Cheaper alternative available for short text.';
  }
  const currentCost = (estimatedTokens * model.inputTokenPrice);
  const suggestedCost = recommendedModel ? (estimatedTokens * recommendedModel.inputTokenPrice) : currentCost;
  const potentialSavings = recommendedModel ? currentCost - suggestedCost : 0;
  return { recommendedModel, currentCost, suggestedCost, potentialSavings, reason };
}
