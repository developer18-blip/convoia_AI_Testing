import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executePythonTool, type ExecutePythonToolDeps } from './agentTools.js';
import {
  acquireSlot,
  releaseSlot,
  worstCaseWalletTokens,
  type SandboxResult,
} from './sandboxService.js';

// ── Helpers ─────────────────────────────────────────────────────────

const goodBalance = { tokenBalance: 10_000_000 };  // way above worst-case ~586

function makeDeps(over: Partial<ExecutePythonToolDeps> = {}): ExecutePythonToolDeps & {
  deductCalls: Array<{ userId: string; tokens: number; description: string }>;
  sandboxCallCount: number;
  acquireCallCount: number;
  releaseCallCount: number;
} {
  const deductCalls: any[] = [];
  let sandboxCallCount = 0;
  let acquireCallCount = 0;
  let releaseCallCount = 0;

  const defaults: ExecutePythonToolDeps = {
    getBalance: async () => goodBalance,
    deductTokens: async (args) => { deductCalls.push(args); return args.tokens; },
    runSandbox: async () => {
      sandboxCallCount++;
      return {
        success: true,
        stdout: 'hello\n',
        stderr: '',
        executionTimeSec: 0.5,
        dollarCost: 0.0000244,
        walletTokensToDeduct: 10,
      } as SandboxResult;
    },
    acquire: (userId: string) => { acquireCallCount++; return acquireSlot(userId); },
    release: (userId: string) => { releaseCallCount++; releaseSlot(userId); },
  };

  // Wrap any override that's a function so we still count
  const wrapped: ExecutePythonToolDeps = { ...defaults, ...over };
  if (over.runSandbox) {
    wrapped.runSandbox = async (...args) => {
      sandboxCallCount++;
      return (over.runSandbox as any)(...args);
    };
  }

  return Object.assign(wrapped, {
    deductCalls,
    get sandboxCallCount() { return sandboxCallCount; },
    get acquireCallCount() { return acquireCallCount; },
    get releaseCallCount() { return releaseCallCount; },
  }) as any;
}

// Each test uses a fresh userId so the shared sandboxService Set
// doesn't leak between tests.
let userIdCounter = 0;
const nextUser = () => `test-user-${++userIdCounter}-${Date.now()}`;

// ── Tests ───────────────────────────────────────────────────────────

describe('agentTools — execute_python dispatch', () => {

  it('successful run returns structured stdout and charges wallet', async () => {
    const userId = nextUser();
    const deps = makeDeps();
    const result = await executePythonTool(userId, 'org-x', 'print("hi")', deps);

    assert.equal(result.success, true);
    assert.equal((result.output as any).stdout, 'hello\n');
    assert.equal((result.output as any).executionTimeSec, 0.5);
    assert.equal(deps.deductCalls.length, 1, 'expected exactly one wallet deduction');
    assert.equal(deps.deductCalls[0].tokens, 10);
    assert.match(deps.deductCalls[0].description, /Python sandbox \(0\.50s, via execute_python\)/);
  });

  it('runtime error returns formatted error string AND still charges wallet', async () => {
    const userId = nextUser();
    const deps = makeDeps({
      runSandbox: async () => ({
        success: false,
        stdout: '',
        stderr: 'ZeroDivisionError\n',
        executionTimeSec: 0.42,
        dollarCost: 0.0000205,
        walletTokensToDeduct: 9,
        error: {
          kind: 'runtime_error',
          message: 'division by zero',
          traceback: 'Traceback (most recent call last):\n  ZeroDivisionError: division by zero',
        },
      } as SandboxResult),
    });

    const result = await executePythonTool(userId, undefined, '1/0', deps);
    assert.equal(result.success, false);
    assert.match(result.error || '', /\[runtime_error\]/);
    assert.match(result.error || '', /division by zero/);
    assert.match(result.error || '', /Traceback:/);
    assert.equal(deps.deductCalls.length, 1, 'runtime_error must still bill (Day 1 rule)');
  });

  it('insufficient wallet balance returns error WITHOUT invoking sandbox', async () => {
    const userId = nextUser();
    const deps = makeDeps({
      getBalance: async () => ({ tokenBalance: worstCaseWalletTokens() - 1 }),
    });

    const result = await executePythonTool(userId, undefined, 'print(1)', deps);
    assert.equal(result.success, false);
    assert.match(result.error || '', /Insufficient tokens/);
    assert.equal(deps.sandboxCallCount, 0, 'sandbox must NOT be invoked on insufficient balance');
    assert.equal(deps.deductCalls.length, 0, 'no deduction on insufficient-balance early return');
  });

  it('concurrency conflict — second concurrent run from same user returns "previous run" error', async () => {
    const userId = nextUser();

    // Acquire the slot manually to simulate an in-flight run.
    assert.equal(acquireSlot(userId), true);

    try {
      const deps = makeDeps();
      const result = await executePythonTool(userId, undefined, 'print(1)', deps);
      assert.equal(result.success, false);
      assert.match(result.error || '', /previous sandbox run/);
      assert.equal(deps.sandboxCallCount, 0, 'sandbox not invoked when slot is busy');
      assert.equal(deps.deductCalls.length, 0, 'no deduction when slot is busy');
    } finally {
      releaseSlot(userId);
    }
  });

  it('provision failure returns error AND does NOT charge wallet', async () => {
    const userId = nextUser();
    const deps = makeDeps({
      runSandbox: async () => ({
        success: false,
        stdout: '',
        stderr: '',
        executionTimeSec: 0,
        dollarCost: 0,
        walletTokensToDeduct: 0,
        error: { kind: 'provision', message: 'E2B quota exhausted' },
      } as SandboxResult),
    });

    const result = await executePythonTool(userId, undefined, 'print(1)', deps);
    assert.equal(result.success, false);
    assert.match(result.error || '', /\[provision\]/);
    assert.equal(deps.deductCalls.length, 0, 'provision failure must NOT charge wallet');
  });
});

describe('sandboxService — slot guard', () => {
  it('acquireSlot returns true once, false until released', () => {
    const userId = `slot-test-${Date.now()}`;
    assert.equal(acquireSlot(userId), true, 'first acquire should succeed');
    assert.equal(acquireSlot(userId), false, 'second acquire must fail while in-flight');
    releaseSlot(userId);
    assert.equal(acquireSlot(userId), true, 'after release, slot is available again');
    releaseSlot(userId);
  });
});
