/**
 * Agent Orchestrator — The brain of the autonomous Dev agent
 *
 * Handles the tool-use loop:
 * 1. Build tool-aware system prompt
 * 2. Send to LLM with tool definitions
 * 3. If LLM returns tool_call → execute tool → feed result back → repeat (max 10 loops)
 * 4. If LLM returns text → stream to user
 * 5. After response, extract and save memory updates
 *
 * Supports native function calling (OpenAI, Anthropic, Gemini) and
 * XML-based fallback for providers without native support.
 */

import axios from 'axios';
import prisma from '../config/db.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';
import { executeTool, TOOL_DEFINITIONS, type ToolResult } from './agentTools.js';
import { buildMemoryPrompt, extractMemoryFromTurn, mergeExtractedMemory } from './agentMemoryService.js';
import AIGatewayService from './aiGatewayService.js';
import { costAdjustedTokens } from '../config/tokenPackages.js';
import { TokenWalletService } from './tokenWalletService.js';

// ── Types ────────────────────────────────────────────────────────────

interface OrchestratorParams {
  userId: string;
  organizationId: string;
  agentId: string;
  modelId: string; // DB model ID
  messages: Array<{ role: string; content: any }>;
  projectId?: string;
  projectName?: string;
  conversationId?: string;
  industry?: string;
}

interface StreamCallbacks {
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

// ── Rate Limiting ────────────────────────────────────────────────────

const toolCallCounts = new Map<string, { count: number; resetAt: number }>();
const TOOL_RATE_LIMIT = 50; // per hour per user
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkToolRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = toolCallCounts.get(userId);
  if (!entry || now > entry.resetAt) {
    toolCallCounts.set(userId, { count: 0, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  return entry.count < TOOL_RATE_LIMIT;
}

function incrementToolCount(userId: string): void {
  const entry = toolCallCounts.get(userId);
  if (entry) entry.count++;
}

// ── Main Orchestrator ────────────────────────────────────────────────

export async function runAgentOrchestrator(
  params: OrchestratorParams,
  callbacks: StreamCallbacks
): Promise<void> {
  const { userId, organizationId, agentId, modelId, messages, projectId, projectName, conversationId } = params;

  // Load agent config
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error('Agent not found');
  if (!agent.toolsEnabled) throw new Error('Agent does not have tools enabled');

  const aiModel = await prisma.aIModel.findUnique({ where: { id: modelId } });
  if (!aiModel) throw new Error('AI Model not found');

  const allowedTools = (agent.tools as string[]) || [];
  const maxCalls = agent.maxToolCalls || 10;

  // Filter tool definitions to only allowed tools
  const availableTools = TOOL_DEFINITIONS.filter(t => {
    const toolGroup = t.name.split('_')[0]; // file, terminal, web, git
    return allowedTools.includes(t.name) || allowedTools.includes(`${toolGroup}_*`) ||
      (toolGroup === 'git' && allowedTools.includes('git_op')) ||
      (toolGroup === 'file' && allowedTools.includes('file_read')) ||
      allowedTools.includes(t.name);
  });

  // Build memory context
  const memoryPrompt = await buildMemoryPrompt(userId, agentId, projectName);

  // Build tool-aware system prompt
  const toolPromptSection = availableTools.length > 0
    ? `\n\n[AVAILABLE TOOLS]\nYou have access to these tools. Use them when needed to accomplish the user's task. You can chain multiple tools in sequence.\n${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}\n\nAfter using tools, always explain what you did and why.`
    : '';

  const systemPrompt = agent.systemPrompt + memoryPrompt + toolPromptSection;

  // Check if provider supports native function calling
  const supportsNativeFunctionCalling = ['openai', 'anthropic', 'google'].includes(aiModel.provider);

  if (supportsNativeFunctionCalling) {
    await runNativeFunctionCallingLoop(
      aiModel, systemPrompt, messages, availableTools, maxCalls,
      userId, organizationId, agentId, projectId || 'default', conversationId || '',
      callbacks
    );
  } else {
    await runXMLFunctionCallingLoop(
      aiModel, systemPrompt, messages, availableTools, maxCalls,
      userId, organizationId, agentId, projectId || 'default', conversationId || '',
      callbacks
    );
  }

  // Background: extract and save memory after the turn
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (lastUserMsg && config.apiKeys.openai) {
    // Fire and forget — don't block the response
    extractMemoryFromTurn(
      typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '',
      '[tool-assisted response]',
      config.apiKeys.openai
    ).then(extracted => {
      if (extracted) {
        mergeExtractedMemory(userId, agentId, extracted, projectName).catch(e =>
          logger.warn(`Memory merge failed: ${e.message}`)
        );
      }
    }).catch(() => { /* silent */ });
  }
}

// ── Native Function Calling (OpenAI format) ──────────────────────────

async function runNativeFunctionCallingLoop(
  aiModel: any, systemPrompt: string,
  messages: Array<{ role: string; content: any }>,
  tools: typeof TOOL_DEFINITIONS,
  maxCalls: number,
  userId: string, organizationId: string, agentId: string,
  projectId: string, conversationId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = config.apiKeys[aiModel.provider as keyof typeof config.apiKeys];
  if (!apiKey) throw new Error(`No API key for ${aiModel.provider}`);

  // Build OpenAI-format tool definitions
  const openAITools = tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  let conversationMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;

  for (let i = 0; i < maxCalls; i++) {
    // Rate limit check
    if (!checkToolRateLimit(userId)) {
      callbacks.onError(new Error('Tool execution rate limit reached (50/hour). Please wait.'));
      return;
    }

    try {
      // Non-streaming call to get tool decisions
      const response = await axios.post(
        getProviderEndpoint(aiModel.provider),
        buildProviderRequest(aiModel, conversationMessages, openAITools),
        {
          headers: getProviderHeaders(aiModel.provider, apiKey),
          timeout: 60000,
        }
      );

      const result = parseProviderResponse(aiModel.provider, response.data);
      totalInputTokens += result.inputTokens;
      totalOutputTokens += result.outputTokens;

      // Check if model wants to use a tool
      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const toolCall of result.toolCalls) {
          toolCallCount++;
          incrementToolCount(userId);

          callbacks.onToolUse({ name: toolCall.name, input: toolCall.arguments });

          const toolResult = await executeTool(
            toolCall.name,
            toolCall.arguments,
            userId, projectId,
            { perplexity: config.apiKeys.perplexity || '' }
          );

          callbacks.onToolResult({ name: toolCall.name, result: toolResult });

          // Log tool execution
          await prisma.toolExecution.create({
            data: {
              userId, agentId, conversationId,
              toolName: toolCall.name,
              toolInput: toolCall.arguments,
              toolOutput: typeof toolResult.output === 'string'
                ? { text: toolResult.output.slice(0, 5000) }
                : toolResult.output ? JSON.parse(JSON.stringify(toolResult.output)) : {},
              durationMs: toolResult.durationMs,
              success: toolResult.success,
            },
          }).catch(e => logger.warn(`Tool execution log failed: ${e.message}`));

          // Add tool result to conversation for next iteration
          conversationMessages.push({
            role: 'assistant',
            content: `[Tool: ${toolCall.name}] ${JSON.stringify(toolCall.arguments)}`,
          });
          conversationMessages.push({
            role: 'user',
            content: `[Tool Result: ${toolCall.name}] ${toolResult.success ? JSON.stringify(toolResult.output).slice(0, 3000) : `Error: ${toolResult.error}`}`,
          });
        }
        // Continue loop — model may want to use more tools
        continue;
      }

      // Model returned text — stream it to user
      if (result.text) {
        callbacks.onChunk(result.text);
      }

      callbacks.onDone(totalInputTokens, totalOutputTokens);

      // Bill for all LLM iterations
      const providerCost = totalInputTokens * aiModel.inputTokenPrice + totalOutputTokens * aiModel.outputTokenPrice;
      const customerPrice = providerCost * (1 + aiModel.markupPercentage / 100);
      const walletTokens = costAdjustedTokens(customerPrice, totalInputTokens + totalOutputTokens);

      await TokenWalletService.deductTokens({
        userId, tokens: walletTokens,
        reference: agentId,
        description: `Agent: ${(await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } }))?.name || 'Dev'} (${toolCallCount} tools)`,
        organizationId,
      });

      // Budget increment
      try {
        await prisma.budget.updateMany({
          where: { userId },
          data: { currentUsage: { increment: customerPrice } },
        });
      } catch { /* non-critical */ }

      logger.info(`Agent orchestrator complete: user=${userId} agent=${agentId} tools=${toolCallCount} iterations=${i + 1} tokens=${totalInputTokens + totalOutputTokens}`);
      return;

    } catch (err: any) {
      logger.error(`Agent orchestrator error on iteration ${i + 1}: ${err.message}`);
      callbacks.onError(err);
      return;
    }
  }

  // Max iterations reached
  callbacks.onChunk('\n\n> **Note:** Reached maximum tool execution limit. Here is what I have so far.');
  callbacks.onDone(totalInputTokens, totalOutputTokens);
}

// ── XML Function Calling (for DeepSeek, Mistral, Groq, etc.) ────────

async function runXMLFunctionCallingLoop(
  aiModel: any, systemPrompt: string,
  messages: Array<{ role: string; content: any }>,
  tools: typeof TOOL_DEFINITIONS,
  maxCalls: number,
  userId: string, organizationId: string, agentId: string,
  projectId: string, conversationId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  // Build XML tool descriptions into the system prompt
  const xmlToolSection = tools.map(t =>
    `<tool name="${t.name}">\n  <description>${t.description}</description>\n  <parameters>${JSON.stringify(t.parameters.properties || {})}</parameters>\n</tool>`
  ).join('\n');

  const xmlSystemPrompt = systemPrompt + `\n\n[TOOL USE FORMAT]\nTo use a tool, output EXACTLY this XML format:\n<tool_call>\n{"name": "tool_name", "arguments": {"param": "value"}}\n</tool_call>\n\nAvailable tools:\n${xmlToolSection}\n\nAfter receiving tool results, continue your response. Only use tools when necessary.`;

  // For XML-based providers, use the standard sendMessage flow but parse for tool_call tags
  const fullResponse = await new Promise<string>(async (resolve) => {
    let accumulated = '';
    await AIGatewayService.sendMessageStream(
      {
        userId, organizationId, modelId: aiModel.id,
        messages,
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
        onError: (err) => { callbacks.onError(err); resolve(''); },
      }
    );
  });

  // Parse for <tool_call> tags
  const toolCallRegex = /<tool_call>\s*({[\s\S]*?})\s*<\/tool_call>/g;
  let match;
  const toolCalls: ToolCall[] = [];

  while ((match = toolCallRegex.exec(fullResponse)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      toolCalls.push({ name: parsed.name, arguments: parsed.arguments || {} });
    } catch { /* skip malformed tool calls */ }
  }

  if (toolCalls.length === 0) {
    // No tool calls — just stream the response
    callbacks.onChunk(fullResponse);
    callbacks.onDone(0, 0);
    return;
  }

  // Execute tool calls and build follow-up
  for (const toolCall of toolCalls.slice(0, maxCalls)) {
    if (!checkToolRateLimit(userId)) break;
    incrementToolCount(userId);

    callbacks.onToolUse({ name: toolCall.name, input: toolCall.arguments });
    const result = await executeTool(toolCall.name, toolCall.arguments, userId, projectId);
    callbacks.onToolResult({ name: toolCall.name, result });

    await prisma.toolExecution.create({
      data: {
        userId, agentId, conversationId,
        toolName: toolCall.name,
        toolInput: toolCall.arguments,
        toolOutput: typeof result.output === 'string' ? { text: result.output.slice(0, 5000) } : result.output || {},
        durationMs: result.durationMs,
        success: result.success,
      },
    }).catch(() => { /* non-critical */ });
  }

  // Send text parts (removing tool_call tags)
  const cleanText = fullResponse.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
  if (cleanText) callbacks.onChunk(cleanText);
  callbacks.onDone(0, 0);
}

// ── Provider-specific helpers ────────────────────────────────────────

function getProviderEndpoint(provider: string): string {
  switch (provider) {
    case 'openai': return 'https://api.openai.com/v1/chat/completions';
    case 'anthropic': return 'https://api.anthropic.com/v1/messages';
    case 'google': return ''; // Handled separately
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

  // OpenAI format (default)
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

  // OpenAI format
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
