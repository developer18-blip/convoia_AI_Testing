import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runNativeFunctionCallingLoop,
  E2B_DOWN_GUARD,
  type ToolLoopParams,
  type ToolLoopDeps,
  type StreamCallbacks,
} from './toolCallLoops.js';
import type { ToolResult } from './agentTools.js';

// ── Helpers ─────────────────────────────────────────────────────────

const fakeModel = {
  id: 'model-claude-opus-4-7',
  provider: 'anthropic',
  modelId: 'claude-opus-4-7',
  inputTokenPrice: 0.000003,
  outputTokenPrice: 0.000015,
  markupPercentage: 25,
  capabilities: ['function_calling'],
};

const fakeTools = [
  {
    name: 'execute_python',
    description: 'Execute Python code in a sandbox',
    parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
  },
];

function noopCallbacks(): StreamCallbacks {
  return {
    onChunk: () => {},
    onToolUse: () => {},
    onToolResult: () => {},
    onDone: () => {},
    onError: () => {},
  };
}

function baseParams(over: Partial<ToolLoopParams> = {}): ToolLoopParams {
  return {
    aiModel: fakeModel,
    systemPrompt: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'hello' }],
    tools: fakeTools as any,
    maxCalls: 3,
    userId: `loop-test-${Date.now()}-${Math.random()}`,  // unique to avoid rate-limit cross-talk
    organizationId: 'org-1',
    agentId: 'agent-1',
    projectId: 'default',
    conversationId: 'conv-1',
    attachmentIds: [],
    callbacks: noopCallbacks(),
    ...over,
  };
}

// Anthropic-shaped response containing a tool call (one).
function anthropicToolCallResponse(toolName: string, args: any) {
  return {
    content: [
      { type: 'tool_use', name: toolName, input: args },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

// Anthropic-shaped response containing only text.
function anthropicTextResponse(text: string, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('runNativeFunctionCallingLoop — extracted core regression', () => {

  it('returns ToolLoopResult with correct shape on success (no tool calls)', async () => {
    const deps: ToolLoopDeps = {
      callProvider: async () => anthropicTextResponse('Hello, world!', 120, 30),
      executeTool: async () => { throw new Error('should not be called'); },
      toolExecutionCreate: async () => { throw new Error('should not be called'); },
    };

    const result = await runNativeFunctionCallingLoop(baseParams(), deps);

    assert.deepEqual(
      { toolCallCount: result.toolCallCount, totalInputTokens: result.totalInputTokens, totalOutputTokens: result.totalOutputTokens, success: result.success },
      { toolCallCount: 0, totalInputTokens: 120, totalOutputTokens: 30, success: true },
    );
  });

  it('agentId: null passes through to toolExecutionCreate (plain-chat path)', async () => {
    const insertedRows: any[] = [];
    let callCount = 0;
    const deps: ToolLoopDeps = {
      callProvider: async () => {
        callCount++;
        // First iter: tool call. Second iter: text wrap-up.
        return callCount === 1
          ? anthropicToolCallResponse('execute_python', { code: 'print(1)' })
          : anthropicTextResponse('Done.', 50, 20);
      },
      executeTool: async () => ({
        success: true,
        output: { stdout: '1\n' },
        durationMs: 500,
      } as ToolResult),
      toolExecutionCreate: async (data) => { insertedRows.push(data); },
    };

    const params = baseParams({ agentId: null });
    const result = await runNativeFunctionCallingLoop(params, deps);

    assert.equal(result.success, true);
    assert.equal(result.toolCallCount, 1);
    assert.equal(insertedRows.length, 1, 'expected exactly one ToolExecution insert');
    assert.equal(insertedRows[0].agentId, null, 'agentId must be passed through as null for plain-chat invocations');
    assert.equal(insertedRows[0].toolName, 'execute_python');
    assert.equal(insertedRows[0].success, true);
  });

  it('E2B provision error → guard message injected, no further tool calls', async () => {
    const providerCalls: any[] = [];
    let provisionErrorEmitted = false;

    const deps: ToolLoopDeps = {
      callProvider: async (_aiModel, body) => {
        providerCalls.push(body);
        // First call: emit a tool_use for execute_python.
        // After the provision-error guard message is injected, the next call
        // should see it in the conversation and respond with text only.
        if (providerCalls.length === 1) {
          return anthropicToolCallResponse('execute_python', { code: 'plot something' });
        }
        // The body messages should contain the E2B_DOWN_GUARD as the latest
        // user message (after the tool result).
        const messages = body.messages;
        const guardPresent = messages.some(
          (m: any) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('sandbox is currently unavailable'),
        );
        if (guardPresent) provisionErrorEmitted = true;
        return anthropicTextResponse('I cannot run the code right now, but here is the approach: ...', 80, 40);
      },
      executeTool: async () => ({
        success: false,
        error: '[provision] E2B quota exhausted',
        output: '',
        durationMs: 100,
      } as ToolResult),
      toolExecutionCreate: async () => {},
    };

    const result = await runNativeFunctionCallingLoop(baseParams(), deps);

    assert.equal(result.success, true, 'loop should complete normally after provision-error recovery');
    assert.equal(result.toolCallCount, 1, 'tool was called once before the guard kicked in');
    assert.equal(providerCalls.length, 2, 'expected exactly 2 LLM calls — original + 1 follow-up after guard');
    assert.equal(provisionErrorEmitted, true, `expected E2B_DOWN_GUARD ("${E2B_DOWN_GUARD.slice(0, 50)}...") to be present in the follow-up LLM context`);
  });
});
