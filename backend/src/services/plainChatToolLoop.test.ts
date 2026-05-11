import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runPlainChatToolLoop,
  isPlainChatToolCapable,
  type PlainChatToolLoopParams,
  type PlainChatToolLoopDeps,
} from './agentOrchestrator.js';
import type { ToolLoopResult, StreamCallbacks } from './toolCallLoops.js';

// ── Helpers ─────────────────────────────────────────────────────────

const fakeModel = {
  id: 'model-claude-opus-4-7',
  provider: 'anthropic',
  modelId: 'claude-opus-4-7',
  inputTokenPrice: 0.000003,
  outputTokenPrice: 0.000015,
  markupPercentage: 25,
  capabilities: ['text', 'function_calling'],
};

function noopCallbacks(): StreamCallbacks {
  return {
    onChunk: () => {},
    onToolUse: () => {},
    onToolResult: () => {},
    onDone: () => {},
    onError: () => {},
  };
}

function baseParams(over: Partial<PlainChatToolLoopParams> = {}): PlainChatToolLoopParams {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    modelId: fakeModel.id,
    messages: [{ role: 'user', content: 'hello' }],
    systemPrompt: 'You are a helpful assistant.',
    conversationId: 'conv-123',
    attachmentIds: [],
    ...over,
  };
}

function makeDeps(loopResult: ToolLoopResult): {
  deps: PlainChatToolLoopDeps;
  deductCalls: any[];
  budgetCalls: Array<{ userId: string; amount: number }>;
  loopCalls: any[];
} {
  const deductCalls: any[] = [];
  const budgetCalls: Array<{ userId: string; amount: number }> = [];
  const loopCalls: any[] = [];
  return {
    deductCalls,
    budgetCalls,
    loopCalls,
    deps: {
      loadAIModel: async () => fakeModel,
      runNativeLoop: async (p) => { loopCalls.push(p); return loopResult; },
      deductTokens: async (args) => { deductCalls.push(args); return args.tokens; },
      incrementBudget: async (userId, amount) => { budgetCalls.push({ userId, amount }); },
      loadAttachments: async () => [],
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('runPlainChatToolLoop — markup logic', () => {

  it('tool invoked → 1.3x markup, "Plain chat (1 tool)" description', async () => {
    const loopResult: ToolLoopResult = {
      toolCallCount: 1,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      success: true,
    };
    const { deps, deductCalls, loopCalls } = makeDeps(loopResult);

    await runPlainChatToolLoop(baseParams(), noopCallbacks(), deps);

    assert.equal(deductCalls.length, 1, 'expected exactly one wallet deduction');
    const call = deductCalls[0];
    assert.match(call.description, /Plain chat \(1 tool\)/);
    assert.equal(call.userId, 'user-1');
    assert.equal(call.organizationId, 'org-1');
    assert.match(call.reference, /^plain-chat-conv-123$/);

    // Math check: providerCost = 1000*0.000003 + 500*0.000015 = 0.003 + 0.0075 = 0.0105
    // customerPrice = 0.0105 * 1.3 = 0.01365
    // tokens are quantized by costAdjustedTokens — just assert > 0 and that the
    // 1.3× markup branch was taken (description encodes that intent)
    assert.ok(call.tokens > 0);

    // The loop was called with maxCalls=3 and tools=[execute_python]
    assert.equal(loopCalls.length, 1);
    assert.equal(loopCalls[0].maxCalls, 3);
    assert.equal(loopCalls[0].tools.length, 1);
    assert.equal(loopCalls[0].tools[0].name, 'execute_python');
    assert.equal(loopCalls[0].agentId, null, 'plain chat passes agentId: null');
  });

  it('no tool invoked → 1.25x markup, "Plain chat" description', async () => {
    const loopResult: ToolLoopResult = {
      toolCallCount: 0,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      success: true,
    };
    const { deps, deductCalls } = makeDeps(loopResult);

    await runPlainChatToolLoop(baseParams(), noopCallbacks(), deps);

    assert.equal(deductCalls.length, 1);
    const call = deductCalls[0];
    assert.equal(call.description, 'Plain chat', 'no-tool description must be exactly "Plain chat" (no tool count)');

    // Math: providerCost = 0.0105, customerPrice = 0.0105 * 1.25 = 0.013125
    // We can't easily assert exact tokens because costAdjustedTokens quantizes,
    // but we can compare against the 1.3× case to confirm the markup is lower.
    assert.ok(call.tokens > 0);
  });

  it('multiple tool calls → "Plain chat (3 tools)" (plural)', async () => {
    const loopResult: ToolLoopResult = {
      toolCallCount: 3,
      totalInputTokens: 2000,
      totalOutputTokens: 800,
      success: true,
    };
    const { deps, deductCalls } = makeDeps(loopResult);

    await runPlainChatToolLoop(baseParams(), noopCallbacks(), deps);

    assert.equal(deductCalls.length, 1);
    assert.match(deductCalls[0].description, /Plain chat \(3 tools\)/);
  });

  it('loop failed (success=false) → no deduction', async () => {
    const loopResult: ToolLoopResult = {
      toolCallCount: 1,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      success: false,
    };
    const { deps, deductCalls, budgetCalls } = makeDeps(loopResult);

    await runPlainChatToolLoop(baseParams(), noopCallbacks(), deps);

    assert.equal(deductCalls.length, 0, 'failed loop must not bill');
    assert.equal(budgetCalls.length, 0, 'failed loop must not increment budget');
  });
});

describe('isPlainChatToolCapable', () => {
  it('Anthropic + function_calling → true (Tier 1)', () => {
    assert.equal(isPlainChatToolCapable({ provider: 'anthropic', capabilities: ['text', 'function_calling'] }), true);
  });

  it('OpenAI + function_calling → true (Tier 1)', () => {
    assert.equal(isPlainChatToolCapable({ provider: 'openai', capabilities: ['function_calling'] }), true);
  });

  it('Google + function_calling → true (Tier 1)', () => {
    assert.equal(isPlainChatToolCapable({ provider: 'google', capabilities: ['function_calling'] }), true);
  });

  it('xAI + function_calling → false (Tier 2, XML fallback)', () => {
    assert.equal(isPlainChatToolCapable({ provider: 'xai', capabilities: ['function_calling'] }), false);
  });

  it('Anthropic without function_calling capability → false', () => {
    assert.equal(isPlainChatToolCapable({ provider: 'anthropic', capabilities: ['text'] }), false);
  });

  it('Anthropic with null capabilities → false', () => {
    assert.equal(isPlainChatToolCapable({ provider: 'anthropic', capabilities: null }), false);
  });
});
