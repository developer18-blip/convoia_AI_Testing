/**
 * Council Service — Multi-Model Consensus Engine
 *
 * Orchestrates the 3-phase pipeline:
 *   Phase 1: Parallel structured queries to N models (2-5)
 *   Phase 2: Cross-examination by the strongest model
 *   Phase 3: Verdict synthesis streamed to the user (Haiku moderator)
 *
 * Billing: user pays for every API call — N + 2 UsageLog rows total.
 */

import AIGatewayService from './aiGatewayService.js';
import { getPhase1Prompt, getPhase2Prompt, getPhase3Prompt, getModelStatusMessages } from './councilPrompts.js';
import { TokenWalletService } from './tokenWalletService.js';
import { costAdjustedTokens } from '../config/tokenPackages.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

export interface CouncilConfig {
  userId: string;
  organizationId: string;
  modelIds: string[];
  query: string;
  intent: string;
  thinkingEnabled?: boolean;
  memoryContext?: string;
}

export interface CouncilCallbacks {
  onModelStart: (modelName: string, modelIndex: number, statusMessage: string) => void;
  onModelProgress: (modelName: string, modelIndex: number, statusMessage: string) => void;
  onModelComplete: (modelName: string, modelIndex: number, durationMs: number, tokenCount: number) => void;
  onModelError: (modelName: string, modelIndex: number, error: string) => void;
  onCrossExamStart: () => void;
  onCrossExamComplete: (durationMs: number) => void;
  onVerdictStart: () => void;
  onVerdictChunk: (text: string) => void;
  onVerdictComplete: () => void;
  onDone: (metadata: CouncilMetadata) => void;
  onError: (error: Error) => void;
}

export interface CouncilMetadata {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  totalWalletTokens: number;
  modelResults: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    response: string;
  }>;
  crossExamDurationMs: number;
  verdictDurationMs: number;
  totalDurationMs: number;
}

type CouncilModel = {
  id: string;
  modelId: string;
  name: string;
  provider: string;
  inputTokenPrice: number;
  outputTokenPrice: number;
  markupPercentage: number;
  contextWindow: number;
};

export async function runCouncil(
  config: CouncilConfig,
  callbacks: CouncilCallbacks,
): Promise<void> {
  const startTime = Date.now();
  const statusMessages = getModelStatusMessages(config.intent);

  if (config.modelIds.length < 2 || config.modelIds.length > 5) {
    callbacks.onError(new Error(`Council requires 2-5 models, got ${config.modelIds.length}`));
    return;
  }

  const models: CouncilModel[] = await prisma.aIModel.findMany({
    where: { id: { in: config.modelIds }, isActive: true },
    select: {
      id: true, modelId: true, name: true, provider: true,
      inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
      contextWindow: true,
    },
  });

  if (models.length < 2) {
    callbacks.onError(new Error('Not enough active models for council'));
    return;
  }

  // Strongest = highest output price (proxy for capability)
  const strongestModel = [...models].sort((a, b) => b.outputTokenPrice - a.outputTokenPrice)[0];

  const moderatorModel = await prisma.aIModel.findFirst({
    where: { modelId: { contains: 'claude-haiku' }, isActive: true },
    select: {
      id: true, modelId: true, name: true, provider: true,
      inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
    },
  });

  if (!moderatorModel) {
    callbacks.onError(new Error('Moderator model (Claude Haiku) not available'));
    return;
  }

  // Pre-flight balance estimate — conservative
  const estimatedOutputPerModel = 2000;
  const estimatedCrossExam = 4000;
  const estimatedVerdict = 1500;
  const estimatedTotalOutput = (models.length * estimatedOutputPerModel) + estimatedCrossExam + estimatedVerdict;
  const maxOutputPrice = Math.max(...models.map(m => m.outputTokenPrice));
  const estimatedCost = estimatedTotalOutput * maxOutputPrice * 1.25;
  const estimatedWalletTokens = Math.ceil(estimatedCost / 0.00000249);

  const balance = await TokenWalletService.getBalance(config.userId);
  if (balance.tokenBalance < estimatedWalletTokens) {
    callbacks.onError(new Error(
      `Council requires approximately ${estimatedWalletTokens.toLocaleString()} tokens. ` +
      `You have ${balance.tokenBalance.toLocaleString()}. Try selecting fewer or cheaper models.`
    ));
    return;
  }

  // ── Phase 1: parallel structured queries ──────────────────────────────
  logger.info(`Council starting: ${models.length} models, query="${config.query.substring(0, 80)}"`);

  type PhaseResult = {
    model: CouncilModel;
    response: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    error?: string;
  };
  const phase1Results: PhaseResult[] = [];

  const phase1Promises = models.map(async (model, index) => {
    const modelStart = Date.now();
    const initialStatus = statusMessages[index % statusMessages.length];
    callbacks.onModelStart(model.name, index, initialStatus);

    let progressInterval: NodeJS.Timeout | undefined = setInterval(() => {
      const elapsed = Date.now() - modelStart;
      const nextStatus = statusMessages[
        Math.min(
          Math.floor(elapsed / 2000) % statusMessages.length,
          statusMessages.length - 1,
        )
      ];
      callbacks.onModelProgress(model.name, index, nextStatus);
    }, 2500);

    try {
      const phase1SystemPrompt = getPhase1Prompt(config.query, model.name);

      const result = await AIGatewayService.sendMessage({
        userId: config.userId,
        organizationId: config.organizationId,
        modelId: model.id,
        messages: [{ role: 'user', content: config.query }],
        agentConfig: {
          systemPrompt: phase1SystemPrompt,
          temperature: 0.4,
          maxTokens: 4096,
          topP: 0.9,
          name: model.name,
        },
        maxOutputTokens: 4096,
        memoryContext: config.memoryContext,
        thinkingEnabled: config.thinkingEnabled,
      });

      if (progressInterval) { clearInterval(progressInterval); progressInterval = undefined; }

      const durationMs = Date.now() - modelStart;
      const totalTokens = result.inputTokens + result.outputTokens;

      const providerCost = result.inputTokens * model.inputTokenPrice + result.outputTokens * model.outputTokenPrice;
      const customerPrice = providerCost * (1 + model.markupPercentage / 100);
      const walletTokens = costAdjustedTokens(customerPrice, totalTokens);

      await TokenWalletService.deductTokens({
        userId: config.userId,
        tokens: walletTokens,
        reference: model.id,
        description: `Council: ${model.name}`,
        organizationId: config.organizationId,
      });

      await prisma.usageLog.create({
        data: {
          userId: config.userId,
          organizationId: config.organizationId,
          modelId: model.id,
          prompt: config.query.substring(0, 500),
          response: result.response.substring(0, 500),
          tokensInput: result.inputTokens,
          tokensOutput: result.outputTokens,
          totalTokens,
          providerCost,
          markupPercentage: model.markupPercentage,
          customerPrice,
          status: 'completed',
        },
      });

      phase1Results.push({
        model,
        response: result.response,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        durationMs,
      });

      callbacks.onModelComplete(model.name, index, durationMs, totalTokens);
      logger.info(`Council Phase 1: ${model.name} complete — ${totalTokens} tokens, ${durationMs}ms`);
    } catch (err: any) {
      if (progressInterval) { clearInterval(progressInterval); progressInterval = undefined; }
      const durationMs = Date.now() - modelStart;
      logger.error(`Council Phase 1: ${model.name} failed — ${err.message}`);

      phase1Results.push({
        model,
        response: '',
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        error: err.message,
      });

      callbacks.onModelError(model.name, index, err.message);
    }
  });

  await Promise.allSettled(phase1Promises);

  const successfulResults = phase1Results.filter(r => !r.error && r.response.length > 50);

  if (successfulResults.length < 2) {
    callbacks.onError(new Error(
      `Only ${successfulResults.length} model(s) responded successfully. Council requires at least 2.`
    ));
    return;
  }

  // ── Phase 2: cross-examination by strongest model ─────────────────────
  callbacks.onCrossExamStart();
  const phase2Start = Date.now();

  logger.info(`Council Phase 2: Cross-examination by ${strongestModel.name}`);

  let crossExamination = '';
  let phase2InputTokens = 0;
  let phase2OutputTokens = 0;

  try {
    const crossExamPrompt = getPhase2Prompt(
      config.query,
      successfulResults.map(r => ({ modelName: r.model.name, response: r.response })),
      strongestModel.name,
    );

    const phase2Result = await AIGatewayService.sendMessage({
      userId: config.userId,
      organizationId: config.organizationId,
      modelId: strongestModel.id,
      messages: [{ role: 'user', content: crossExamPrompt }],
      agentConfig: {
        systemPrompt: 'You are a rigorous intellectual cross-examiner. Analyze with precision. No filler.',
        temperature: 0.3,
        maxTokens: 4096,
        topP: 0.9,
        name: 'Cross-Examiner',
      },
      maxOutputTokens: 4096,
      thinkingEnabled: config.thinkingEnabled,
    });

    crossExamination = phase2Result.response;
    phase2InputTokens = phase2Result.inputTokens;
    phase2OutputTokens = phase2Result.outputTokens;

    const p2ProviderCost = phase2InputTokens * strongestModel.inputTokenPrice + phase2OutputTokens * strongestModel.outputTokenPrice;
    const p2CustomerPrice = p2ProviderCost * (1 + strongestModel.markupPercentage / 100);
    const p2WalletTokens = costAdjustedTokens(p2CustomerPrice, phase2InputTokens + phase2OutputTokens);

    await TokenWalletService.deductTokens({
      userId: config.userId,
      tokens: p2WalletTokens,
      reference: strongestModel.id,
      description: `Council cross-exam: ${strongestModel.name}`,
      organizationId: config.organizationId,
    });

    await prisma.usageLog.create({
      data: {
        userId: config.userId,
        organizationId: config.organizationId,
        modelId: strongestModel.id,
        prompt: '[Council cross-examination]',
        response: crossExamination.substring(0, 500),
        tokensInput: phase2InputTokens,
        tokensOutput: phase2OutputTokens,
        totalTokens: phase2InputTokens + phase2OutputTokens,
        providerCost: p2ProviderCost,
        markupPercentage: strongestModel.markupPercentage,
        customerPrice: p2CustomerPrice,
        status: 'completed',
      },
    });
  } catch (err: any) {
    logger.error(`Council Phase 2 failed: ${err.message}`);
    // Fallback: concat raw responses so Phase 3 still produces something
    crossExamination = successfulResults
      .map(r => `${r.model.name}: ${r.response.substring(0, 1000)}`)
      .join('\n\n---\n\n');
  }

  const crossExamDuration = Date.now() - phase2Start;
  callbacks.onCrossExamComplete(crossExamDuration);

  // ── Phase 3: verdict streamed to user ─────────────────────────────────
  callbacks.onVerdictStart();
  const phase3Start = Date.now();

  logger.info('Council Phase 3: Verdict synthesis');

  const verdictPrompt = getPhase3Prompt(
    config.query,
    crossExamination,
    successfulResults.map(r => r.model.name),
    successfulResults.length,
  );

  let phase3InputTokens = 0;
  let phase3OutputTokens = 0;

  try {
    await AIGatewayService.sendMessageStream(
      {
        userId: config.userId,
        organizationId: config.organizationId,
        modelId: moderatorModel.id,
        messages: [{ role: 'user', content: verdictPrompt }],
        agentConfig: {
          systemPrompt: 'You are the ConvoiaAI Council. Deliver verdicts with clarity and authority. Never mention internal processes, phases, or model names.',
          temperature: 0.3,
          maxTokens: 3000,
          topP: 0.9,
          name: 'ConvoiaAI Council',
        },
        maxOutputTokens: 3000,
      },
      {
        onChunk: (text: string) => {
          callbacks.onVerdictChunk(text);
        },
        onDone: async (inputTokens: number, outputTokens: number) => {
          phase3InputTokens = inputTokens;
          phase3OutputTokens = outputTokens;

          const p3ProviderCost = inputTokens * moderatorModel.inputTokenPrice + outputTokens * moderatorModel.outputTokenPrice;
          const p3CustomerPrice = p3ProviderCost * (1 + moderatorModel.markupPercentage / 100);
          const p3WalletTokens = costAdjustedTokens(p3CustomerPrice, inputTokens + outputTokens);

          await TokenWalletService.deductTokens({
            userId: config.userId,
            tokens: p3WalletTokens,
            reference: moderatorModel.id,
            description: 'Council verdict: ConvoiaAI',
            organizationId: config.organizationId,
          });

          await prisma.usageLog.create({
            data: {
              userId: config.userId,
              organizationId: config.organizationId,
              modelId: moderatorModel.id,
              prompt: '[Council verdict synthesis]',
              response: '[Council verdict — streamed]',
              tokensInput: inputTokens,
              tokensOutput: outputTokens,
              totalTokens: inputTokens + outputTokens,
              providerCost: p3ProviderCost,
              markupPercentage: moderatorModel.markupPercentage,
              customerPrice: p3CustomerPrice,
              status: 'completed',
            },
          });

          const verdictDuration = Date.now() - phase3Start;
          const totalDuration = Date.now() - startTime;

          const totalInputTokens = successfulResults.reduce((s, r) => s + r.inputTokens, 0) + phase2InputTokens + phase3InputTokens;
          const totalOutputTokens = successfulResults.reduce((s, r) => s + r.outputTokens, 0) + phase2OutputTokens + phase3OutputTokens;
          const totalTokens = totalInputTokens + totalOutputTokens;

          let totalCost = 0;
          let totalWalletTokens = 0;
          for (const r of successfulResults) {
            const pc = r.inputTokens * r.model.inputTokenPrice + r.outputTokens * r.model.outputTokenPrice;
            const cp = pc * (1 + r.model.markupPercentage / 100);
            totalCost += cp;
            totalWalletTokens += costAdjustedTokens(cp, r.inputTokens + r.outputTokens);
          }
          const p2pc = phase2InputTokens * strongestModel.inputTokenPrice + phase2OutputTokens * strongestModel.outputTokenPrice;
          const p2cp = p2pc * (1 + strongestModel.markupPercentage / 100);
          totalCost += p2cp;
          totalWalletTokens += costAdjustedTokens(p2cp, phase2InputTokens + phase2OutputTokens);
          const p3pc = phase3InputTokens * moderatorModel.inputTokenPrice + phase3OutputTokens * moderatorModel.outputTokenPrice;
          const p3cp = p3pc * (1 + moderatorModel.markupPercentage / 100);
          totalCost += p3cp;
          totalWalletTokens += costAdjustedTokens(p3cp, phase3InputTokens + phase3OutputTokens);

          callbacks.onVerdictComplete();
          callbacks.onDone({
            totalInputTokens,
            totalOutputTokens,
            totalTokens,
            totalCost,
            totalWalletTokens,
            modelResults: successfulResults.map(r => ({
              modelName: r.model.name,
              inputTokens: r.inputTokens,
              outputTokens: r.outputTokens,
              durationMs: r.durationMs,
              response: r.response,
            })),
            crossExamDurationMs: crossExamDuration,
            verdictDurationMs: verdictDuration,
            totalDurationMs: totalDuration,
          });

          logger.info(`Council complete: ${models.length} models, ${totalTokens} tokens, $${totalCost.toFixed(4)}, ${totalDuration}ms`);
        },
        onError: (err: Error) => {
          logger.error(`Council Phase 3 streaming failed: ${err.message}`);
          callbacks.onError(err);
        },
      },
    );
  } catch (err: any) {
    logger.error(`Council Phase 3 failed: ${err.message}`);
    callbacks.onError(err);
  }
}
