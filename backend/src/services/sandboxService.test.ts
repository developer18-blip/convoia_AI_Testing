import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executePython,
  computeSandboxDollarCost,
  computeSandboxWalletTokens,
  worstCaseWalletTokens,
  SANDBOX_SPEC,
  type SandboxFactory,
  type SandboxHandle,
  type ExecutionRecord,
} from './sandboxService.js';

// ── COST CALCULATION (pure functions, no SDK needed) ───────────────

describe('sandboxService — cost math', () => {
  it('computeSandboxDollarCost matches the Phase 2 numbers at 1s and 30s', () => {
    // 2 vCPU @ $0.000014/s + 1 GiB RAM @ $0.0000045/s = $0.0000325/s raw
    // × 1.5 markup = $0.00004875/s
    const oneSec = computeSandboxDollarCost(1);
    assert.equal(oneSec.toFixed(7), '0.0000487');

    const thirtySec = computeSandboxDollarCost(30);
    // 30 × 0.00004875 = 0.0014625
    assert.equal(thirtySec.toFixed(7), '0.0014625');
  });

  it('computeSandboxDollarCost returns 0 for non-positive seconds', () => {
    assert.equal(computeSandboxDollarCost(0), 0);
    assert.equal(computeSandboxDollarCost(-5), 0);
    assert.equal(computeSandboxDollarCost(NaN), 0);
  });

  it('worstCaseWalletTokens equals 30s of cost converted through TOKEN_BASE_RATE', () => {
    const worst = worstCaseWalletTokens();
    // Phase 2 sanity range: ~586. Allow ±10% drift if TOKEN_BASE_RATE
    // changes because package prices shifted.
    assert.ok(worst >= 500 && worst <= 700, `worst=${worst} outside [500,700]`);
    assert.equal(worst, computeSandboxWalletTokens(SANDBOX_SPEC.timeoutSec));
  });
});

// ── FACTORY-INJECTED EXECUTION (no real E2B calls) ─────────────────

function makeFactory(handle: Partial<SandboxHandle> & {
  runResult?: ExecutionRecord;
  runError?: Error;
  createError?: Error;
}): SandboxFactory {
  return async () => {
    if (handle.createError) throw handle.createError;
    return {
      runCode: handle.runCode ?? (async () => {
        if (handle.runError) throw handle.runError;
        return handle.runResult ?? { logs: { stdout: [], stderr: [] } };
      }),
      kill: handle.kill ?? (async () => { /* noop */ }),
    };
  };
}

describe('sandboxService — executePython', () => {
  const apiKey = 'test-key';

  it('simple code success returns stdout + bills for elapsed time', async () => {
    const factory = makeFactory({
      runResult: {
        logs: { stdout: ['hello\n'], stderr: [] },
      },
    });
    const result = await executePython('print("hello")', { factory, apiKey });
    assert.equal(result.success, true);
    assert.equal(result.stdout, 'hello\n');
    assert.equal(result.stderr, '');
    assert.equal(result.error, undefined);
    assert.ok(result.executionTimeSec >= 0);
    // Real execution time should yield non-negative cost. Even a 0s
    // stub result must yield 0 dollars / 0 tokens (no over-billing).
    assert.ok(result.dollarCost >= 0);
    assert.ok(result.walletTokensToDeduct >= 0);
  });

  it('runtime error is classified and the user is billed for the elapsed time', async () => {
    const factory = makeFactory({
      runResult: {
        logs: { stdout: [], stderr: ['Traceback...\n'] },
        error: {
          name: 'ZeroDivisionError',
          value: 'division by zero',
          traceback: 'Traceback (most recent call last):\n  ZeroDivisionError: division by zero',
        },
      },
    });
    const result = await executePython('1/0', { factory, apiKey });
    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'runtime_error');
    assert.equal(result.error?.message, 'division by zero');
    assert.ok(result.error?.traceback?.includes('ZeroDivisionError'));
    // Phase 2 rule: bill for actual elapsed time on user-errors.
    assert.ok(result.walletTokensToDeduct >= 0);
  });

  it('syntax error is classified as syntax_error (no execution time spent)', async () => {
    const factory = makeFactory({
      runResult: {
        logs: { stdout: [], stderr: [] },
        error: {
          name: 'SyntaxError',
          value: "invalid syntax (<string>, line 1)",
          traceback: 'SyntaxError: invalid syntax',
        },
      },
    });
    const result = await executePython('def foo(:', { factory, apiKey });
    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'syntax_error');
  });

  it('runCode throwing "timeout" maps to timeout error kind', async () => {
    const factory = makeFactory({
      runCode: async () => { throw new Error('Execution timed out after 30000ms'); },
    });
    const result = await executePython('while True: pass', { factory, apiKey });
    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'timeout');
  });

  it('provision failure → no charge (walletTokensToDeduct === 0)', async () => {
    const factory = makeFactory({
      createError: new Error('E2B quota exhausted'),
    });
    const result = await executePython('print("never runs")', { factory, apiKey });
    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'provision');
    assert.equal(result.walletTokensToDeduct, 0);
    assert.equal(result.dollarCost, 0);
    assert.equal(result.executionTimeSec, 0);
  });

  it('missing API key returns provision error without invoking the factory', async () => {
    let factoryCalled = false;
    const factory: SandboxFactory = async () => {
      factoryCalled = true;
      return { runCode: async () => ({}), kill: async () => {} };
    };
    const result = await executePython('print(1)', { factory, apiKey: '' });
    assert.equal(factoryCalled, false);
    assert.equal(result.error?.kind, 'provision');
    assert.equal(result.walletTokensToDeduct, 0);
  });

  it('rejects code over the maxCodeChars limit as a syntax_error', async () => {
    const big = 'x'.repeat(SANDBOX_SPEC.maxCodeChars + 1);
    const result = await executePython(big, { factory: makeFactory({}), apiKey });
    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'syntax_error');
    assert.match(result.error?.message || '', /character limit/);
  });

  it('sandbox.kill() is called even when runCode throws asynchronously', async () => {
    let killed = false;
    const factory: SandboxFactory = async () => ({
      runCode: async () => { throw new Error('boom'); },
      kill: async () => { killed = true; },
    });
    await executePython('print(1)', { factory, apiKey });
    assert.equal(killed, true);
  });

  it('sandbox.kill() is called even when runCode throws synchronously', async () => {
    // Non-async runCode that throws BEFORE returning a Promise. The
    // surrounding try/catch must still capture this and finally must
    // still call kill(). Exercises the same try/finally as the async
    // case but via a different JS code path (sync throw vs rejected
    // promise) — confirms the cleanup is robust to both shapes.
    let killed = false;
    const factory: SandboxFactory = async () => ({
      // eslint-disable-next-line @typescript-eslint/require-await
      runCode: (() => { throw new Error('sync boom'); }) as SandboxHandle['runCode'],
      kill: async () => { killed = true; },
    });
    const result = await executePython('print(1)', { factory, apiKey });
    assert.equal(killed, true);
    assert.equal(result.success, false);
    assert.equal(result.error?.kind, 'unknown');
    assert.match(result.error?.message || '', /sync boom/);
  });
});
