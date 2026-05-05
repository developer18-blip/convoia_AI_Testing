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
import { config as envConfig } from '../config/env.js';
import { getEmbedding, cosineSimilarity } from './embeddingService.js';

/**
 * The moderator (Phase 3 verdict synthesizer) is configurable via this
 * substring match. We previously used Haiku for cost; switched to Sonnet
 * 4.6 on Day 1 of the synthesis-quality rebuild because Haiku is too weak
 * to adjudicate substantive disagreement with conviction.
 */
export const MODERATOR_MODEL_SUBSTRING = 'claude-sonnet-4-6';

/**
 * Phase 2 outcome status — passed to Phase 3 as a preamble in the
 * crossExamination input string, and included in CouncilMetadata for
 * production telemetry.
 *
 *   ok               → cross-exam ran cleanly, Phase 3 input unchanged from Day 1
 *   skipped          → conditional skip fired (responses agreed); raw responses passed
 *   degraded         → cross-exam threw; structured fallback (preamble + raw responses)
 *   degraded_legacy  → flag-off path or hardened-fallback construction itself failed
 */
export type Phase2Status = 'ok' | 'degraded' | 'skipped' | 'degraded_legacy';

export interface CouncilConfig {
  userId: string;
  organizationId: string;
  modelIds: string[];
  query: string;
  // Rich multimodal messages forwarded to Phase 1 experts. Includes
  // text content from prior turns, document text from uploaded PDFs,
  // and (when present) image_url blocks for vision analysis.
  // Phase 2 + 3 reason over text outputs and don't need this.
  messages: Array<{ role: string; content: any }>;
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
  phase2Status: Phase2Status;
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
  capabilities: string[];
};

// Strip image_url / image / inlineData parts from a multimodal content
// array, keeping only text. Used when dispatching to a non-vision model.
function stripImageParts(messages: Array<{ role: string; content: any }>): Array<{ role: string; content: any }> {
  return messages.map(m => {
    if (!Array.isArray(m.content)) return m;
    const textOnly = m.content
      .filter((c: any) => c?.type === 'text' || typeof c === 'string')
      .map((c: any) => (typeof c === 'string' ? c : c.text))
      .join('\n');
    return { ...m, content: textOnly || '[image attached, but this model cannot view images]' };
  });
}
// ── Day 2 helpers ─────────────────────────────────────────────────────

/**
 * Concat raw Phase 1 responses for use as Phase 3 input when no structured
 * cross-exam output is available (skipped or degraded paths).
 *
 * truncate=1000 reproduces the exact Day 1 legacy fallback formatting,
 * for the degraded_legacy path. Untruncated form is used by the
 * skipped/degraded paths so Phase 3 has full context.
 */
function buildRawResponseConcat(
  results: Array<{ model: { name: string }; response: string }>,
  truncate?: number,
): string {
  return results
    .map(r => truncate
      ? `${r.model.name}: ${r.response.substring(0, truncate)}`
      : `${r.model.name}:\n${r.response}`)
    .join('\n\n---\n\n');
}

/**
 * Preamble prepended to the crossExamination string before the locked
 * Day 1 Phase 3 prompt is built. The Day 1 system prompt and the body
 * of getPhase3Prompt() stay bit-identical — situational awareness is
 * delivered in the user-message data layer only.
 */
function buildPhase3Preamble(status: Phase2Status): string {
  switch (status) {
    case 'ok':
      return '';
    case 'degraded':
      return 'NOTE: cross-examination step failed. Below are the raw model responses without structured analysis. Synthesize cautiously — there may be unresolved disagreements not visible in the input.\n\n';
    case 'skipped':
      return 'NOTE: cross-examination was skipped because all models reached substantively similar conclusions. Below are the model responses directly. Synthesize the consensus answer.\n\n';
    case 'degraded_legacy':
      // Bit-identical Day 1 behavior: no preamble.
      return '';
  }
}

type SkipDecision =
  | { skip: true; minPairwiseSim: number; pairwiseSims: number[] }
  | { skip: false; minPairwiseSim: number; pairwiseSims: number[]; reason: string };

/**
 * Decide whether to skip Phase 2 based on Phase 1 response similarity.
 * Skip iff ALL pairwise cosine similarities meet or exceed the threshold —
 * the minimum pairwise score is the binding constraint. Fail-safe: any
 * error or timeout returns { skip: false } so the caller proceeds with
 * Phase 2 normally (Day 1 behavior).
 */
async function decidePhase2Skip(
  responses: Array<{ modelName: string; response: string }>,
  threshold: number,
  timeoutMs = 5000,
): Promise<SkipDecision> {
  if (responses.length < 2) {
    return { skip: false, minPairwiseSim: 0, pairwiseSims: [], reason: 'fewer_than_2_responses' };
  }
  try {
    const embedAll = Promise.all(responses.map(r => getEmbedding(r.response)));
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('embedding_timeout')), timeoutMs),
    );
    const embeddings = await Promise.race([embedAll, timeout]);
    if (embeddings.some(e => e.length === 0)) {
      return { skip: false, minPairwiseSim: 0, pairwiseSims: [], reason: 'empty_embedding' };
    }
    const sims: number[] = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        sims.push(cosineSimilarity(embeddings[i], embeddings[j]));
      }
    }
    const minSim = Math.min(...sims);
    return minSim >= threshold
      ? { skip: true, minPairwiseSim: minSim, pairwiseSims: sims }
      : { skip: false, minPairwiseSim: minSim, pairwiseSims: sims, reason: 'below_threshold' };
  } catch (err: any) {
    logger.warn(`Phase 2 skip decision failed: ${err.message} — falling through to Phase 2`);
    return { skip: false, minPairwiseSim: 0, pairwiseSims: [], reason: err.message };
  }
}

export async function runCouncil(
  config: CouncilConfig,
  callbacks: CouncilCallbacks,
): Promise<void> {
  const startTime = Date.now();
  const statusMessages = getModelStatusMessages(config.intent);

  if (config.modelIds.length < 2 || config.modelIds.length > 3) {
    callbacks.onError(new Error(`Council requires 2-3 models, got ${config.modelIds.length}`));
    return;
  }

  const models: CouncilModel[] = await prisma.aIModel.findMany({
    where: { id: { in: config.modelIds }, isActive: true },
    select: {
      id: true, modelId: true, name: true, provider: true,
      inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
      contextWindow: true, capabilities: true,
    },
  });

  if (models.length < 2) {
    callbacks.onError(new Error('Not enough active models for council'));
    return;
  }

  // Strongest = highest output price (proxy for capability)
  const strongestModel = [...models].sort((a, b) => b.outputTokenPrice - a.outputTokenPrice)[0];

  // Moderator: prefer Sonnet 4.6 for stronger synthesis; fall back to Haiku
  // if Sonnet isn't seeded/active (keeps Apex runnable on minimal model sets).
  let moderatorCandidate = await prisma.aIModel.findFirst({
    where: { modelId: { contains: 'claude-sonnet-4-6' }, isActive: true },
    select: {
      id: true, modelId: true, name: true, provider: true,
      inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
    },
  });

  if (!moderatorCandidate) {
    logger.warn('Apex: claude-sonnet-4-6 moderator not found, falling back to Haiku');
    moderatorCandidate = await prisma.aIModel.findFirst({
      where: { modelId: { contains: 'claude-haiku' }, isActive: true },
      select: {
        id: true, modelId: true, name: true, provider: true,
        inputTokenPrice: true, outputTokenPrice: true, markupPercentage: true,
      },
    });
  }

  if (!moderatorCandidate) {
    callbacks.onError(new Error('Apex: no moderator model available (neither Sonnet 4.6 nor Haiku)'));
    return;
  }
  // Rebind to `const` so TypeScript preserves non-null narrowing across
  // the rest of this function (Phase 2 + Phase 3 references below).
  const moderatorModel = moderatorCandidate;

  // Pre-flight balance estimate — conservative
  const estimatedOutputPerModel = 2000;
  const estimatedCrossExam = 4000;
  const estimatedVerdict = 1500;
  const estimatedTotalOutput = (models.length * estimatedOutputPerModel) + estimatedCrossExam + estimatedVerdict;
  const maxOutputPrice = Math.max(...models.map(m => m.outputTokenPrice));
  const estimatedCost = estimatedTotalOutput * maxOutputPrice * 1.275; // 27.5% markup — unified Convoia policy
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

      // Vision filtering: if the conversation has image content but this
      // expert isn't vision-capable, send text-only (image stripped). The
      // expert sees the user's text description but can't analyze the
      // pixels — better than rejecting the whole Apex run.
      const hasImageContent = config.messages.some(
        m => Array.isArray(m.content) && m.content.some((c: any) => c?.type === 'image_url' || c?.type === 'image')
      );
      const isVisionCapable = (model.capabilities || []).some(c => c === 'vision' || c === 'multimodal');
      const messagesForExpert = (hasImageContent && !isVisionCapable)
        ? stripImageParts(config.messages)
        : config.messages;
      if (hasImageContent && !isVisionCapable) {
        logger.info(`Council: ${model.name} is not vision-capable — sending text-only`);
      }

      const result = await AIGatewayService.sendMessage({
        userId: config.userId,
        organizationId: config.organizationId,
        modelId: model.id,
        messages: messagesForExpert,
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
  let phase2Status: Phase2Status = 'ok';

  // ── Day 2: conditional skip ────────────────────────────────────────
  // Default-off via APEX_PHASE2_CONDITIONAL_SKIP. When enabled, embed
  // the Phase 1 responses, compute pairwise cosine similarity, and skip
  // cross-exam entirely when all pairs clear the threshold.
  if (envConfig.apex.phase2ConditionalSkip) {
    const decision = await decidePhase2Skip(
      successfulResults.map(r => ({ modelName: r.model.name, response: r.response })),
      envConfig.apex.phase2SkipThreshold,
    );
    if (decision.skip) {
      phase2Status = 'skipped';
      crossExamination = buildRawResponseConcat(successfulResults);
      logger.info(`Council Phase 2: SKIPPED — minPairwiseSim=${decision.minPairwiseSim.toFixed(3)} threshold=${envConfig.apex.phase2SkipThreshold}`);
    } else {
      logger.info(`Council Phase 2: not skipping — minPairwiseSim=${decision.minPairwiseSim.toFixed(3)} reason=${decision.reason}`);
    }
  }

  // Cross-exam runs only if not skipped above.
  if (phase2Status === 'ok') {
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

      if (envConfig.apex.phase2FallbackHardened) {
        try {
          // Hardened path: full responses, structured signal to Phase 3.
          phase2Status = 'degraded';
          crossExamination = buildRawResponseConcat(successfulResults);
        } catch (innerErr: any) {
          // Defensive — string concat shouldn't fail, but if it does,
          // fall through to legacy and tag for telemetry.
          logger.error(`Hardened fallback construction failed: ${innerErr.message}`);
          phase2Status = 'degraded_legacy';
          crossExamination = buildRawResponseConcat(successfulResults, 1000);
        }
      } else {
        // Flag off → bit-identical Day 1 behavior (raw concat truncated to 1K)
        phase2Status = 'degraded_legacy';
        crossExamination = buildRawResponseConcat(successfulResults, 1000);
      }
    }
  }

  const crossExamDuration = Date.now() - phase2Start;
  callbacks.onCrossExamComplete(crossExamDuration);

  // ── Phase 3: verdict streamed to user ─────────────────────────────────
  callbacks.onVerdictStart();
  const phase3Start = Date.now();

  logger.info('Council Phase 3: Verdict synthesis');

  const verdictPrompt = getPhase3Prompt(
    config.query,
    buildPhase3Preamble(phase2Status) + crossExamination,
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
          systemPrompt: 'You are an expert synthesizer. You write the final answer the user reads, in your own voice, drawing silently on prior analysis you have access to. Never reveal the existence of that analysis, the multi-model process, or any process metadata.',
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
            phase2Status,
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
