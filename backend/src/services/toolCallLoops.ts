/**
 * Tool-call inner loops — provider-agnostic core extracted from
 * agentOrchestrator. Two flavors:
 *
 *   - runNativeFunctionCallingLoop: OpenAI/Anthropic/Google native tool use
 *   - runXMLFunctionCallingLoop:    text-based <tool_call>{...}</tool_call>
 *                                   fallback for providers without native
 *
 * Both are wrapped by:
 *   - runAgentOrchestrator (agent flow — agent.systemPrompt + memory + multi-tool)
 *   - runPlainChatToolLoop (plain-chat flow — task prompt + execute_python only)
 *
 * Billing is OUT of the inner loops. They return ToolLoopResult; callers
 * compute customer price with the markup they want (per-model for agent
 * flow, hardcoded 1.25/1.3 split for plain chat).
 */

import axios from 'axios';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { executeTool, TOOL_DEFINITIONS, type ToolResult } from './agentTools.js';
import AIGatewayService from './aiGatewayService.js';

// ── Public types ────────────────────────────────────────────────────

export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onToolUse: (tool: { name: string; input: Record<string, any> }) => void;
  onToolResult: (tool: { name: string; result: ToolResult }) => void;
  onDone: (inputTokens: number, outputTokens: number) => void;
  onError: (error: Error) => void;
}

interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolLoopParams {
  aiModel: any;
  systemPrompt: string;
  messages: Array<{ role: string; content: any }>;
  tools: typeof TOOL_DEFINITIONS;
  /** Hard cap on tool-call iterations. Agent wrapper passes agent.maxToolCalls; plain-chat wrapper passes 3. */
  maxCalls: number;
  userId: string;
  organizationId: string;
  /** Null for plain-chat invocations; real agent UUID for agent flow. */
  agentId: string | null;
  projectId: string;
  conversationId: string;
  attachmentIds: string[];
  callbacks: StreamCallbacks;
}

export interface ToolLoopResult {
  toolCallCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  /** False if onError fired or max iterations reached. Caller skips billing if false. */
  success: boolean;
}

/** Dependency-injection seam for tests. Production callers omit `deps`. */
export interface ToolLoopDeps {
  callProvider?: (aiModel: any, body: any) => Promise<any>;
  executeTool?: typeof executeTool;
  toolExecutionCreate?: (data: any) => Promise<void>;
}

// ── Rate limiting (shared across agent + plain-chat flows) ──────────

const toolCallCounts = new Map<string, { count: number; resetAt: number }>();
const TOOL_RATE_LIMIT = 50;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export function checkToolRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = toolCallCounts.get(userId);
  if (!entry || now > entry.resetAt) {
    toolCallCounts.set(userId, { count: 0, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  return entry.count < TOOL_RATE_LIMIT;
}

export function incrementToolCount(userId: string): void {
  const entry = toolCallCounts.get(userId);
  if (entry) entry.count++;
}

// ── Provider helpers ────────────────────────────────────────────────

function getProviderEndpoint(provider: string): string {
  switch (provider) {
    case 'openai': return 'https://api.openai.com/v1/chat/completions';
    case 'anthropic': return 'https://api.anthropic.com/v1/messages';
    case 'google': return ''; // handled separately
    default: return 'https://api.openai.com/v1/chat/completions';
  }
}

function getProviderHeaders(provider: string, apiKey: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
    default:
      return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  }
}

function buildProviderRequest(aiModel: any, messages: any[], tools: any[]): any {
  if (aiModel.provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');
    return {
      model: aiModel.modelId,
      max_tokens: 16384,
      system: systemMsg?.content || '',
      messages: otherMsgs,
      tools: tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
    };
  }
  return {
    model: aiModel.modelId,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    max_tokens: 16384,
    temperature: 0.2,
  };
}

function parseProviderResponse(provider: string, data: any): {
  text: string;
  toolCalls: ToolCall[] | null;
  inputTokens: number;
  outputTokens: number;
} {
  if (provider === 'anthropic') {
    const textBlocks = data.content?.filter((c: any) => c.type === 'text') || [];
    const toolBlocks = data.content?.filter((c: any) => c.type === 'tool_use') || [];
    return {
      text: textBlocks.map((b: any) => b.text).join(''),
      toolCalls: toolBlocks.length > 0
        ? toolBlocks.map((b: any) => ({ name: b.name, arguments: b.input }))
        : null,
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    };
  }
  const choice = data.choices?.[0];
  const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  })) || null;
  return {
    text: choice?.message?.content || '',
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

/** Detection helper: did this tool result indicate an E2B provision failure? */
function isProvisionError(toolResult: ToolResult): boolean {
  return (
    !toolResult.success &&
    typeof toolResult.error === 'string' &&
    toolResult.error.includes('[provision]')
  );
}

export const E2B_DOWN_GUARD =
  'IMPORTANT: The code execution sandbox is currently unavailable. ' +
  'Do not call execute_python again in this turn. ' +
  'Continue your response explaining the approach in plain English without running code.';

// Default production provider call.
async function defaultCallProvider(aiModel: any, body: any): Promise<any> {
  const apiKey = config.apiKeys[aiModel.provider as keyof typeof config.apiKeys];
  if (!apiKey) throw new Error(`No API key for ${aiModel.provider}`);
  const response = await axios.post(
    getProviderEndpoint(aiModel.provider),
    body,
    {
      headers: getProviderHeaders(aiModel.provider, apiKey),
      timeout: 180_000,
    }
  );
  return response.data;
}

async function defaultToolExecutionCreate(data: any): Promise<void> {
  await prisma.toolExecution.create({ data }).catch(e => logger.warn(`Tool execution log failed: ${e.message}`));
}

// ── Native function-calling loop ────────────────────────────────────

export async function runNativeFunctionCallingLoop(
  p: ToolLoopParams,
  deps: ToolLoopDeps = {}
): Promise<ToolLoopResult> {
  const callProvider = deps.callProvider ?? defaultCallProvider;
  const execTool = deps.executeTool ?? executeTool;
  const toolExecCreate = deps.toolExecutionCreate ?? defaultToolExecutionCreate;

  const openAITools = p.tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  let conversationMessages: Array<{ role: string; content: any }> = [
    { role: 'system', content: p.systemPrompt },
    ...p.messages,
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;

  for (let i = 0; i < p.maxCalls; i++) {
    if (!checkToolRateLimit(p.userId)) {
      p.callbacks.onError(new Error('Tool execution rate limit reached (50/hour). Please wait.'));
      return { toolCallCount, totalInputTokens, totalOutputTokens, success: false };
    }

    try {
      const data = await callProvider(
        p.aiModel,
        buildProviderRequest(p.aiModel, conversationMessages, openAITools),
      );
      const result = parseProviderResponse(p.aiModel.provider, data);
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;

      if (result.toolCalls && result.toolCalls.length > 0) {
        let provisionErrorThisIter = false;

        for (const toolCall of result.toolCalls) {
          toolCallCount++;
          incrementToolCount(p.userId);

          p.callbacks.onToolUse({ name: toolCall.name, input: toolCall.arguments });

          const toolResult = await execTool(
            toolCall.name,
            toolCall.arguments,
            p.userId, p.projectId,
            { perplexity: config.apiKeys.perplexity || '' },
            p.organizationId,
            p.attachmentIds,
          );

          p.callbacks.onToolResult({ name: toolCall.name, result: toolResult });

          await toolExecCreate({
            userId: p.userId,
            agentId: p.agentId,
            conversationId: p.conversationId,
            toolName: toolCall.name,
            toolInput: toolCall.arguments,
            toolOutput: typeof toolResult.output === 'string'
              ? { text: toolResult.output.slice(0, 5000) }
              : toolResult.output ? JSON.parse(JSON.stringify(toolResult.output)) : {},
            durationMs: toolResult.durationMs,
            success: toolResult.success,
          });

          // execute_python may emit base64 plots → bigger budget. Other tools
          // keep the original 3K cap to avoid context-window bloat.
          const truncationLimit = toolCall.name === 'execute_python' ? 100_000 : 3_000;
          conversationMessages.push({
            role: 'assistant',
            content: `[Tool: ${toolCall.name}] ${JSON.stringify(toolCall.arguments)}`,
          });
          conversationMessages.push({
            role: 'user',
            content: `[Tool Result: ${toolCall.name}] ${
              toolResult.success
                ? JSON.stringify(toolResult.output).slice(0, truncationLimit)
                : `Error: ${toolResult.error}`
            }`,
          });

          if (isProvisionError(toolResult)) provisionErrorThisIter = true;
        }

        // E2B-down guard: if any tool call in this iteration hit a provision
        // failure, inject a stop-retrying message so the next LLM round
        // produces a plain-English answer instead of re-trying the sandbox.
        if (provisionErrorThisIter) {
          conversationMessages.push({ role: 'user', content: E2B_DOWN_GUARD });
        }

        continue;
      }

      // Text response — stream and done
      if (result.text) p.callbacks.onChunk(result.text);
      return { toolCallCount, totalInputTokens, totalOutputTokens, success: true };
    } catch (err: any) {
      logger.error(`Tool loop error on iteration ${i + 1}: ${err.message}`);
      p.callbacks.onError(err);
      return { toolCallCount, totalInputTokens, totalOutputTokens, success: false };
    }
  }

  // Max iterations reached — no billing (matches original orchestrator behavior).
  p.callbacks.onChunk('\n\n> **Note:** Reached maximum tool execution limit. Here is what I have so far.');
  return { toolCallCount, totalInputTokens, totalOutputTokens, success: false };
}

// ── XML function-calling loop ───────────────────────────────────────

export async function runXMLFunctionCallingLoop(
  p: ToolLoopParams,
  deps: ToolLoopDeps = {}
): Promise<ToolLoopResult> {
  const execTool = deps.executeTool ?? executeTool;
  const toolExecCreate = deps.toolExecutionCreate ?? defaultToolExecutionCreate;

  const xmlToolSection = p.tools.map(t =>
    `<tool name="${t.name}">\n  <description>${t.description}</description>\n  <parameters>${JSON.stringify(t.parameters.properties || {})}</parameters>\n</tool>`
  ).join('\n');

  const xmlSystemPrompt = p.systemPrompt + `\n\n[TOOL USE FORMAT]\nTo use a tool, output EXACTLY this XML format:\n<tool_call>\n{"name": "tool_name", "arguments": {"param": "value"}}\n</tool_call>\n\nAvailable tools:\n${xmlToolSection}\n\nAfter receiving tool results, continue your response. Only use tools when necessary.`;

  let streamErrored = false;

  const fullResponse = await new Promise<string>(async (resolve) => {
    let accumulated = '';
    await AIGatewayService.sendMessageStream(
      {
        userId: p.userId, organizationId: p.organizationId, modelId: p.aiModel.id,
        messages: p.messages,
        agentConfig: {
          systemPrompt: xmlSystemPrompt,
          temperature: 0.2,
          maxTokens: 16384,
          topP: 0.95,
          name: 'Dev',
        },
      },
      {
        onChunk: (text) => { accumulated += text; },
        onDone: () => { resolve(accumulated); },
        onError: (err) => { streamErrored = true; p.callbacks.onError(err); resolve(''); },
      }
    );
  });

  if (streamErrored) {
    return { toolCallCount: 0, totalInputTokens: 0, totalOutputTokens: 0, success: false };
  }

  // Parse for <tool_call> tags
  const toolCallRegex = /<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/g;
  let match;
  const toolCalls: ToolCall[] = [];
  while ((match = toolCallRegex.exec(fullResponse)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      toolCalls.push({ name: parsed.name, arguments: parsed.arguments || {} });
    } catch { /* skip malformed */ }
  }

  if (toolCalls.length === 0) {
    p.callbacks.onChunk(fullResponse);
    // XML loop bills via sendMessageStream internally — totals are 0 here so
    // the outer wrapper's billing math naturally short-circuits.
    return { toolCallCount: 0, totalInputTokens: 0, totalOutputTokens: 0, success: true };
  }

  let toolCallCount = 0;
  let provisionErrorSeen = false;

  for (const toolCall of toolCalls.slice(0, p.maxCalls)) {
    if (!checkToolRateLimit(p.userId)) break;
    incrementToolCount(p.userId);
    toolCallCount++;

    p.callbacks.onToolUse({ name: toolCall.name, input: toolCall.arguments });
    const result = await execTool(
      toolCall.name, toolCall.arguments,
      p.userId, p.projectId,
      undefined,
      p.organizationId,
      p.attachmentIds,
    );
    p.callbacks.onToolResult({ name: toolCall.name, result });

    await toolExecCreate({
      userId: p.userId,
      agentId: p.agentId,
      conversationId: p.conversationId,
      toolName: toolCall.name,
      toolInput: toolCall.arguments,
      toolOutput: typeof result.output === 'string' ? { text: result.output.slice(0, 5000) } : result.output || {},
      durationMs: result.durationMs,
      success: result.success,
    });

    if (isProvisionError(result)) provisionErrorSeen = true;
  }

  // XML loop doesn't do a second LLM round to interpret results — the LLM
  // has already produced its text. Surface a user-facing notice instead.
  const cleanText = fullResponse.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
  if (cleanText) p.callbacks.onChunk(cleanText);
  if (provisionErrorSeen) {
    p.callbacks.onChunk(
      '\n\n_Code execution sandbox is currently unavailable — falling back to text-only explanation._'
    );
  }
  return { toolCallCount, totalInputTokens: 0, totalOutputTokens: 0, success: true };
}
