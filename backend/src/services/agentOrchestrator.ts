/**
 * Agent Orchestrator + plain-chat tool router.
 *
 * Wraps the provider-agnostic core in toolCallLoops.ts with two flows:
 *   - runAgentOrchestrator: agent.systemPrompt + memory + multi-tool. Bills
 *     LLM tokens with the model's markupPercentage (default 1.25×). Tool
 *     handlers (e.g., executePythonTool) bill their own runtime separately.
 *   - runPlainChatToolLoop: task-tuned prompt + execute_python only,
 *     maxCalls=3, no agent record. Bills LLM tokens with runtime markup
 *     override — 1.3× when a tool was invoked, 1.25× otherwise.
 *
 * isPlainChatToolCapable gates the plain-chat flow at the dispatch site
 * (aiController.ts).
 */

import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { TOOL_DEFINITIONS } from './agentTools.js';
import { buildMemoryPrompt, extractMemoryFromTurn, mergeExtractedMemory } from './agentMemoryService.js';
import { costAdjustedTokens } from '../config/tokenPackages.js';
import { TokenWalletService } from './tokenWalletService.js';
import {
  runNativeFunctionCallingLoop,
  runXMLFunctionCallingLoop,
  type ToolLoopParams,
  type StreamCallbacks,
} from './toolCallLoops.js';

// Re-export so callers (aiController) can keep their existing import.
export type { StreamCallbacks } from './toolCallLoops.js';

// ── Types ────────────────────────────────────────────────────────────

export interface OrchestratorParams {
  userId: string;
  organizationId: string;
  agentId: string;
  modelId: string;
  messages: Array<{ role: string; content: any }>;
  projectId?: string;
  projectName?: string;
  conversationId?: string;
  industry?: string;
  attachmentIds?: string[];
}

export interface PlainChatToolLoopParams {
  userId: string;
  organizationId: string;
  modelId: string;
  messages: Array<{ role: string; content: any }>;
  /** Already task-tuned and memory-merged by the caller (aiController). */
  systemPrompt: string;
  projectId?: string;
  conversationId?: string;
  industry?: string;
  attachmentIds?: string[];
}

/** DI seam for plain-chat tool-loop tests. Production callers omit `deps`. */
export interface PlainChatToolLoopDeps {
  loadAIModel?: (modelId: string) => Promise<any>;
  runNativeLoop?: typeof runNativeFunctionCallingLoop;
  deductTokens?: typeof TokenWalletService.deductTokens;
  incrementBudget?: (userId: string, amount: number) => Promise<void>;
  loadAttachments?: (ids: string[], userId: string) => Promise<Array<{ fileName: string; fileType: string; fileSize: number; localPath: string | null }>>;
}

// ── Agent orchestrator (existing flow, behavior preserved) ──────────

export async function runAgentOrchestrator(
  params: OrchestratorParams,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { userId, organizationId, agentId, modelId, messages, projectId, projectName, conversationId } = params;
  const attachmentIds = params.attachmentIds ?? [];

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error('Agent not found');
  if (!agent.toolsEnabled) throw new Error('Agent does not have tools enabled');

  const aiModel = await prisma.aIModel.findUnique({ where: { id: modelId } });
  if (!aiModel) throw new Error('AI Model not found');

  const allowedTools = (agent.tools as string[]) || [];
  const maxCalls = agent.maxToolCalls || 10;

  const availableTools = TOOL_DEFINITIONS.filter(t => {
    const toolGroup = t.name.split('_')[0];
    return allowedTools.includes(t.name) || allowedTools.includes(`${toolGroup}_*`) ||
      (toolGroup === 'git' && allowedTools.includes('git_op')) ||
      (toolGroup === 'file' && allowedTools.includes('file_read')) ||
      allowedTools.includes(t.name);
  });

  const memoryPrompt = await buildMemoryPrompt(userId, agentId, projectName);

  const toolPromptSection = availableTools.length > 0
    ? `\n\n[AVAILABLE TOOLS]\nYou have access to these tools. Use them when needed to accomplish the user's task. You can chain multiple tools in sequence.\n${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}\n\nAfter using tools, always explain what you did and why.`
    : '';

  const fileContextSection = await buildFileContextSection(attachmentIds, userId);

  const systemPrompt = agent.systemPrompt + memoryPrompt + toolPromptSection + fileContextSection;

  const supportsNativeFunctionCalling = ['openai', 'anthropic', 'google'].includes(aiModel.provider);

  const loopParams: ToolLoopParams = {
    aiModel,
    systemPrompt,
    messages,
    tools: availableTools,
    maxCalls,
    userId,
    organizationId,
    agentId,
    projectId: projectId || 'default',
    conversationId: conversationId || '',
    attachmentIds,
    callbacks,
  };

  const result = supportsNativeFunctionCalling
    ? await runNativeFunctionCallingLoop(loopParams)
    : await runXMLFunctionCallingLoop(loopParams);

  // Bill only if loop completed normally AND we actually tracked tokens.
  // Both native and XML paths return real token counts from the inner loop;
  // the wrapper bills uniformly. (Earlier comment claimed XML billed via
  // sendMessageStream internally — that was never true and caused 5
  // tier-2 providers to go unbilled until restored 2026-05-20.)
  if (result.success && (result.totalInputTokens + result.totalOutputTokens) > 0) {
    const providerCost =
      result.totalInputTokens * aiModel.inputTokenPrice +
      result.totalOutputTokens * aiModel.outputTokenPrice;
    const customerPrice = providerCost * (1 + aiModel.markupPercentage / 100);
    const walletTokens = costAdjustedTokens(customerPrice, result.totalInputTokens + result.totalOutputTokens);

    await TokenWalletService.deductTokens({
      userId,
      tokens: walletTokens,
      reference: agentId,
      description: `Agent: ${agent.name || 'Dev'} (${result.toolCallCount} tools)`,
      organizationId,
    });

    try {
      await prisma.budget.updateMany({
        where: { userId },
        data: { currentUsage: { increment: customerPrice } },
      });
    } catch { /* non-critical */ }
  }

  callbacks.onDone(result.totalInputTokens, result.totalOutputTokens);

  logger.info(
    `Agent orchestrator complete: user=${userId} agent=${agentId} tools=${result.toolCallCount} success=${result.success} tokens=${result.totalInputTokens + result.totalOutputTokens}`,
  );

  // Background memory extraction — unchanged
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg && config.apiKeys.openai) {
    extractMemoryFromTurn(
      typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '',
      '[tool-assisted response]',
      config.apiKeys.openai,
    ).then(extracted => {
      if (extracted) {
        mergeExtractedMemory(userId, agentId, extracted, projectName).catch(e =>
          logger.warn(`Memory merge failed: ${e.message}`),
        );
      }
    }).catch(() => { /* silent */ });
  }
}

// ── Plain-chat tool loop (new) ──────────────────────────────────────

export async function runPlainChatToolLoop(
  params: PlainChatToolLoopParams,
  callbacks: StreamCallbacks,
  deps: PlainChatToolLoopDeps = {},
): Promise<void> {
  const { userId, organizationId, modelId, messages, systemPrompt, projectId, conversationId } = params;
  const attachmentIds = params.attachmentIds ?? [];

  const loadAIModel = deps.loadAIModel ?? ((id: string) => prisma.aIModel.findUnique({ where: { id } }));
  const runNativeLoop = deps.runNativeLoop ?? runNativeFunctionCallingLoop;
  const deductTokens = deps.deductTokens ?? TokenWalletService.deductTokens.bind(TokenWalletService);
  const incrementBudget = deps.incrementBudget ?? (async (uid: string, amt: number) => {
    try {
      await prisma.budget.updateMany({ where: { userId: uid }, data: { currentUsage: { increment: amt } } });
    } catch { /* non-critical */ }
  });

  const aiModel = await loadAIModel(modelId);
  if (!aiModel) throw new Error('AI Model not found');

  const executePythonTool = TOOL_DEFINITIONS.find(t => t.name === 'execute_python');
  if (!executePythonTool) throw new Error('execute_python tool definition missing');
  const tools = [executePythonTool];

  const fileContextSection = await buildFileContextSection(attachmentIds, userId, deps.loadAttachments);

  // Caller-supplied systemPrompt already contains the task-tuned prompt plus
  // user memory (built in aiController.ts as systemPromptWithMemory). We
  // append the tool advertisement and file context here so the inner loop
  // doesn't have to know anything plain-chat-specific.
  const toolPromptSection =
    `\n\n[AVAILABLE TOOLS]\n` +
    `You have access to the execute_python tool. Use it when the user's request would benefit from running Python code (calculations, data analysis, plotting, file processing). For general questions, conversation, or knowledge queries, answer directly without invoking the tool.\n` +
    `- ${executePythonTool.name}: ${executePythonTool.description}`;

  const fullSystemPrompt = systemPrompt + toolPromptSection + fileContextSection;

  const loopParams: ToolLoopParams = {
    aiModel,
    systemPrompt: fullSystemPrompt,
    messages,
    tools,
    maxCalls: 3,                  // Lower than agent's 8 — plain chat is not opt-in to heavy tool use.
    userId,
    organizationId,
    agentId: null,                // Plain chat has no agent record.
    projectId: projectId || 'default',
    conversationId: conversationId || '',
    attachmentIds,
    callbacks,
  };

  // Plain chat is gated to Tier-1 providers (native function calling) at the
  // dispatch site (isPlainChatToolCapable). XML loop is never reached here.
  const result = await runNativeLoop(loopParams);

  if (result.success && (result.totalInputTokens + result.totalOutputTokens) > 0) {
    const providerCost =
      result.totalInputTokens * aiModel.inputTokenPrice +
      result.totalOutputTokens * aiModel.outputTokenPrice;

    // Runtime markup override: 1.3× if a tool fired, 1.25× otherwise.
    // Bills the LLM portion only — sandbox seconds are billed separately by
    // executePythonTool (Day 2 behavior, unchanged).
    const effectiveMarkup = result.toolCallCount > 0 ? 1.3 : 1.25;
    const customerPrice = providerCost * effectiveMarkup;
    const tokens = costAdjustedTokens(customerPrice, result.totalInputTokens + result.totalOutputTokens);

    await deductTokens({
      userId,
      tokens,
      reference: `plain-chat-${conversationId ?? 'no-conv'}`,
      description: result.toolCallCount > 0
        ? `Plain chat (${result.toolCallCount} tool${result.toolCallCount === 1 ? '' : 's'})`
        : `Plain chat`,
      organizationId,
    });

    await incrementBudget(userId, customerPrice);
  }

  callbacks.onDone(result.totalInputTokens, result.totalOutputTokens);

  logger.info(
    `Plain-chat tool loop complete: user=${userId} tools=${result.toolCallCount} success=${result.success} markup=${result.toolCallCount > 0 ? '1.3x' : '1.25x'} tokens=${result.totalInputTokens + result.totalOutputTokens}`,
  );
}

// ── Tier-1 capability detection ────────────────────────────────────

const TIER_1_TOOL_PROVIDERS = ['anthropic', 'openai', 'google'];

/**
 * Is this model eligible for plain-chat tool use?
 * MVP: Tier-1 providers (native function calling) with function_calling capability.
 * Tier-2 providers (XML fallback) are deferred.
 */
export function isPlainChatToolCapable(aiModel: {
  provider: string;
  capabilities: string[] | null;
}): boolean {
  return (
    TIER_1_TOOL_PROVIDERS.includes(aiModel.provider) &&
    Array.isArray(aiModel.capabilities) &&
    aiModel.capabilities.includes('function_calling')
  );
}

// ── Shared file-context builder ────────────────────────────────────

async function buildFileContextSection(
  attachmentIds: string[],
  userId: string,
  loadAttachments?: (ids: string[], userId: string) => Promise<Array<{ fileName: string; fileType: string; fileSize: number; localPath: string | null }>>,
): Promise<string> {
  if (attachmentIds.length === 0) return '';
  try {
    const files = loadAttachments
      ? await loadAttachments(attachmentIds, userId)
      : await prisma.conversationAttachment.findMany({
          where: { id: { in: attachmentIds }, userId },
          select: { fileName: true, fileType: true, fileSize: true, localPath: true },
        });
    if (files.length === 0) return '';
    const fileLines = files.map(f => {
      const sizeKB = (f.fileSize / 1024).toFixed(1);
      const truncated = !f.localPath && f.fileType === 'csv' && f.fileSize > 100_000;
      const tag = truncated
        ? ' — LEGACY UPLOAD, only first 500 rows available via /sandbox/inputs/; mention this to the user if it matters'
        : '';
      return `- ${f.fileName} (${f.fileType}, ${sizeKB} KB)${tag}`;
    }).join('\n');
    return (
      `\n\n[FILES AVAILABLE IN SANDBOX]\n` +
      `The user attached the following files. Load them via /sandbox/inputs/<filename> when relevant:\n` +
      `${fileLines}\n`
    );
  } catch (err: any) {
    logger.warn(`File context lookup failed for user ${userId}: ${err.message}`);
    return '';
  }
}
