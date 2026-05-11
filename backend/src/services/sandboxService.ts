import { config } from '../config/env.js';
import { TOKEN_BASE_RATE, costAdjustedTokens } from '../config/tokenPackages.js';
import logger from '../config/logger.js';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

// ── COST MODEL (E2B pricing as of 2026-05-11) ──────────────────────
//
//   vCPU:  $0.000014 per second per vCPU
//   RAM:   $0.0000045 per second per GiB
//
// Day 1 sandbox spec: 2 vCPU + 1 GiB RAM
//   raw   = 2 * 0.000014 + 1 * 0.0000045 = $0.0000325/s
//   *1.5  markup                          = $0.00004875/s
//
// Worst-case 30s timeout → $0.001463 ≈ 586 wallet tokens at
// TOKEN_BASE_RATE ≈ $0.0000025. The pre-flight wallet check uses
// this worst-case so the user can never have a query partially
// charged-then-rejected.
//
// If you change the sandbox spec (RAM, vCPU, timeout) update these
// constants — every downstream cost number derives from them.
// ───────────────────────────────────────────────────────────────────
export const SANDBOX_SPEC = {
  vCpu: 2,
  ramGiB: 1,
  timeoutSec: 30,
  markup: 1.5,
  maxCodeChars: 10_000,
} as const;

const E2B_VCPU_PRICE_PER_SEC = 0.000014;
const E2B_RAM_PRICE_PER_SEC_PER_GIB = 0.0000045;

/** Dollar cost of running the sandbox for `seconds` at the Day 1 spec. */
export function computeSandboxDollarCost(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const rawPerSec = SANDBOX_SPEC.vCpu * E2B_VCPU_PRICE_PER_SEC
                  + SANDBOX_SPEC.ramGiB * E2B_RAM_PRICE_PER_SEC_PER_GIB;
  return rawPerSec * SANDBOX_SPEC.markup * seconds;
}

/** Wallet tokens to deduct for `seconds` of sandbox time. */
export function computeSandboxWalletTokens(seconds: number): number {
  const dollars = computeSandboxDollarCost(seconds);
  if (dollars <= 0) return 0;
  return costAdjustedTokens(dollars, 0);
}

/** Worst-case wallet cost for a single execution (30s timeout). */
export function worstCaseWalletTokens(): number {
  return computeSandboxWalletTokens(SANDBOX_SPEC.timeoutSec);
}

// ── CONCURRENCY GUARD ───────────────────────────────────────────────
//
// One concurrent sandbox per user. Both POST /api/sandbox/execute-python
// AND the agent-orchestrator execute_python tool route through this set,
// so a user can't fire two simultaneous runs (one via API, one via chat)
// and burn double the E2B budget. In-process Set is fine for single PM2
// worker; becomes Redis if we scale horizontally.
// ───────────────────────────────────────────────────────────────────
const inFlightUsers = new Set<string>();

/** Returns true if the slot was acquired; caller MUST call releaseSlot() in a finally block. */
export function acquireSlot(userId: string): boolean {
  if (inFlightUsers.has(userId)) return false;
  inFlightUsers.add(userId);
  return true;
}

/** Always safe to call — idempotent. */
export function releaseSlot(userId: string): void {
  inFlightUsers.delete(userId);
}

// ── PLOT STORAGE + TOKEN HELPERS ────────────────────────────────────
//
// Plots produced by `plt.show()` are extracted from the E2B Execution
// result, written to local disk under `uploads/sandbox-plots/<userId>/`,
// and surfaced to the LLM via a small metadata array. The LLM emits
// markdown `![](api/sandbox/plot/<id>?token=<token>)` — the chat UI's
// existing <img> renderer fetches the bytes through a token-gated
// endpoint that mirrors the file-download pattern in fileRoutes.ts.
//
// Tokens are dedicated to plots (signPlotToken / verifyPlotToken) so
// the plot lifecycle (7d TTL, per-user directory) stays independent
// from the file-generation flow. The cross-check rule from fileRoutes
// (token's plotId must match the path's :plotId) is enforced inside
// the plot controller.
// ───────────────────────────────────────────────────────────────────

const PLOT_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;  // 7 days
const PLOT_STORAGE_ROOT = path.join(process.cwd(), 'uploads', 'sandbox-plots');

export interface PlotTokenPayload {
  plotId: string;
  userId: string;
}

export interface PlotMetadata {
  id: string;
  token: string;
  mimeType: 'image/png';
  filename: string;
}

export function signPlotToken(plotId: string, userId: string): string {
  return jwt.sign({ plotId, userId } as PlotTokenPayload, config.jwtSecret, {
    expiresIn: PLOT_TOKEN_TTL_SECONDS,
  });
}

export function verifyPlotToken(token: string): PlotTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as PlotTokenPayload & { iat?: number; exp?: number };
    if (!decoded?.plotId || !decoded?.userId) return null;
    return { plotId: decoded.plotId, userId: decoded.userId };
  } catch {
    return null;
  }
}

/** Absolute path to a stored plot. Creating the parent directory is the writer's job. */
export function plotStoragePath(userId: string, plotId: string): string {
  return path.join(PLOT_STORAGE_ROOT, userId, `${plotId}.png`);
}

/** Default disk writer for plots. Tests can inject a stub via ExecutePythonOptions. */
function defaultWritePlotToDisk(userId: string, plotId: string, bytes: Buffer): void {
  const dest = plotStoragePath(userId, plotId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

// ── RESULT TYPES ───────────────────────────────────────────────────

export type SandboxErrorKind =
  | 'timeout'        // exceeded 30s wall clock
  | 'syntax_error'   // SyntaxError / IndentationError before execution
  | 'runtime_error'  // exception raised during execution
  | 'provision'      // failed to start the sandbox (network, no API key, quota)
  | 'unknown';       // something else we don't know how to classify

export interface SandboxResult {
  /** True if user code ran to completion without raising. stderr may still have content (warnings). */
  success: boolean;
  stdout: string;
  stderr: string;
  /** Present when success=false. */
  error?: {
    kind: SandboxErrorKind;
    message: string;
    /** Truncated traceback string when available. */
    traceback?: string;
  };
  /** Wall-clock seconds the sandbox was alive (used for billing). 0 on provision failure. */
  executionTimeSec: number;
  /** Dollar cost charged to the platform for E2B time. 0 on provision failure. */
  dollarCost: number;
  /** Wallet tokens we should deduct. 0 on provision failure. */
  walletTokensToDeduct: number;
  /** PNG plots extracted from the execution's results[] (matplotlib plt.show()). Empty array if none. */
  plots?: PlotMetadata[];
}

// ── DEPENDENCY INJECTION (for tests) ────────────────────────────────
//
// In production we lazy-import `@e2b/code-interpreter` so the server
// can boot even if the SDK isn't installed (the route returns 503
// instead). In tests we inject a fake factory that synthesizes
// Sandbox-shaped results without any network calls.
// ───────────────────────────────────────────────────────────────────

/** Single result item from the E2B Execution. Day 3 only consumes `png`. */
export interface ExecutionResultItem {
  /** Base64-encoded PNG bytes when matplotlib plt.show() produced a figure. */
  png?: string;
}

export interface ExecutionRecord {
  text?: string;
  logs?: { stdout?: string[]; stderr?: string[] };
  error?: { name?: string; value?: string; traceback?: string };
  /** E2B `Execution.results` — matplotlib plots and other rich outputs. */
  results?: ExecutionResultItem[];
}

export interface SandboxHandle {
  runCode(code: string, opts?: { timeoutMs?: number }): Promise<ExecutionRecord>;
  /** Optional — used to stage user-uploaded attachments before runCode. Production wraps E2B's sbx.files.write. */
  writeFile?(filePath: string, content: Uint8Array | string): Promise<void>;
  kill(): Promise<void>;
}

export type SandboxFactory = (apiKey: string) => Promise<SandboxHandle>;

/** Default factory: lazy-imports the real E2B SDK and wraps it. */
const defaultSandboxFactory: SandboxFactory = async (apiKey) => {
  // Lazy import so missing dependency doesn't crash boot.
  const mod = await import('@e2b/code-interpreter');
  const SandboxCls = (mod as any).Sandbox;
  if (!SandboxCls) {
    throw new Error('E2B SDK missing Sandbox export');
  }
  const sbx = await SandboxCls.create({ apiKey });
  return {
    runCode: async (code, opts) => {
      const exec = await sbx.runCode(code, { timeoutMs: opts?.timeoutMs });
      return {
        text: exec?.text,
        logs: exec?.logs,
        error: exec?.error,
        results: exec?.results,
      };
    },
    writeFile: async (filePath, content) => {
      // E2B SDK: sandbox.files.write(path, data). Accepts string or bytes.
      await (sbx as any).files?.write?.(filePath, content);
    },
    kill: async () => { try { await sbx.kill(); } catch { /* idempotent */ } },
  };
};

// ── PUBLIC: executePython ──────────────────────────────────────────

/** Single user-uploaded attachment ready to stage into the sandbox at /sandbox/inputs/<fileName>. */
export interface AttachmentInput {
  fileName: string;
  /** UTF-8 string OR raw bytes; the sandbox SDK accepts both. */
  content: Uint8Array | string;
}

export interface ExecutePythonOptions {
  /** Owner of this run — required for plot storage partitioning + audit logs. */
  userId?: string;
  /** Files to stage at /sandbox/inputs/<fileName> before user code runs. */
  attachments?: AttachmentInput[];
  /** Override the sandbox factory in tests. */
  factory?: SandboxFactory;
  /** Override the API key (defaults to config.e2bApiKey). */
  apiKey?: string;
  /** Override the disk writer for plots — tests inject a stub to avoid real fs writes. */
  writePlotToDisk?: (userId: string, plotId: string, bytes: Buffer) => void;
}

/**
 * Run a Python snippet in a fresh E2B sandbox. Returns a structured
 * result with stdout / stderr / error classification + the wallet
 * cost the caller should deduct.
 *
 * Billing rule (Day 1):
 *   - Provision failure  → walletTokensToDeduct = 0 (we ate the cost)
 *   - Anything else      → bill for actual seconds elapsed
 *     (timeout, syntax error, runtime error all bill — the sandbox
 *     spent E2B compute time before failing)
 */
export async function executePython(
  code: string,
  options: ExecutePythonOptions = {}
): Promise<SandboxResult> {
  const factory = options.factory ?? defaultSandboxFactory;
  const apiKey = options.apiKey ?? config.e2bApiKey;
  const userId = options.userId;
  const attachments = options.attachments ?? [];
  const writePlotToDisk = options.writePlotToDisk ?? defaultWritePlotToDisk;

  if (!apiKey) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: { kind: 'provision', message: 'E2B_API_KEY not configured' },
      executionTimeSec: 0,
      dollarCost: 0,
      walletTokensToDeduct: 0,
    };
  }

  if (typeof code !== 'string' || code.length === 0) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: { kind: 'syntax_error', message: 'No code provided' },
      executionTimeSec: 0,
      dollarCost: 0,
      walletTokensToDeduct: 0,
    };
  }

  if (code.length > SANDBOX_SPEC.maxCodeChars) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: {
        kind: 'syntax_error',
        message: `Code exceeds ${SANDBOX_SPEC.maxCodeChars}-character limit`,
      },
      executionTimeSec: 0,
      dollarCost: 0,
      walletTokensToDeduct: 0,
    };
  }

  const timeoutMs = SANDBOX_SPEC.timeoutSec * 1000;
  let sandbox: SandboxHandle | null = null;
  let elapsedSec = 0;
  let startTime = 0;

  try {
    sandbox = await factory(apiKey);
  } catch (err: any) {
    logger.error(`Sandbox provision failed: ${err?.message || err}`);
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: {
        kind: 'provision',
        message: err?.message || 'Failed to provision sandbox',
      },
      executionTimeSec: 0,
      dollarCost: 0,
      walletTokensToDeduct: 0,
    };
  }

  try {
    // Stage user-uploaded attachments at /sandbox/inputs/<fileName>
    // BEFORE running user code. The system prompt teaches the LLM to
    // read from this exact path, e.g. pd.read_csv('/sandbox/inputs/data.csv').
    // Stateless reminder: every executePython call re-uploads — there is
    // no session-scoped cache yet. Documented Day 4+ optimization.
    if (attachments.length && sandbox.writeFile) {
      for (const att of attachments) {
        try {
          await sandbox.writeFile(`/sandbox/inputs/${att.fileName}`, att.content);
        } catch (uploadErr: any) {
          // Upload failure shouldn't abort the run — log + continue so
          // the LLM at least gets a clean stderr trace if its code
          // tries to read the missing file.
          logger.warn(`Sandbox attachment upload failed for ${att.fileName}: ${uploadErr?.message || uploadErr}`);
        }
      }
    }

    startTime = Date.now();
    const exec = await sandbox.runCode(code, { timeoutMs });
    elapsedSec = (Date.now() - startTime) / 1000;

    const stdout = (exec?.logs?.stdout ?? []).join('');
    const stderr = (exec?.logs?.stderr ?? []).join('');
    const dollarCost = computeSandboxDollarCost(elapsedSec);
    const walletTokensToDeduct = computeSandboxWalletTokens(elapsedSec);

    // Extract PNG plots from Execution.results[]. plt.show() in the
    // Jupyter kernel populates each Result.png with base64 PNG bytes.
    // We write each to disk under uploads/sandbox-plots/<userId>/<id>.png
    // and sign a 7-day token. Skipped silently when userId is missing —
    // sandboxService callers without a userId (older tests) don't
    // generate plots.
    const plots: PlotMetadata[] = [];
    if (userId && exec?.results?.length) {
      let idx = 0;
      for (const r of exec.results) {
        if (!r?.png) continue;
        idx++;
        try {
          const bytes = Buffer.from(r.png, 'base64');
          const plotId = crypto.randomUUID();
          writePlotToDisk(userId, plotId, bytes);
          plots.push({
            id: plotId,
            token: signPlotToken(plotId, userId),
            mimeType: 'image/png',
            filename: `plot-${idx}.png`,
          });
        } catch (plotErr: any) {
          logger.warn(`Plot extraction failed (idx=${idx}): ${plotErr?.message || plotErr}`);
        }
      }
    }

    if (exec?.error) {
      const kind = classifyExecutionError(exec.error);
      const tb = exec.error.traceback ? truncate(exec.error.traceback, 2000) : undefined;
      return {
        success: false,
        stdout,
        stderr,
        error: {
          kind,
          message: exec.error.value || exec.error.name || 'Execution failed',
          traceback: tb,
        },
        executionTimeSec: elapsedSec,
        dollarCost,
        walletTokensToDeduct,
        plots: plots.length ? plots : undefined,
      };
    }

    return {
      success: true,
      stdout,
      stderr,
      executionTimeSec: elapsedSec,
      dollarCost,
      walletTokensToDeduct,
      plots: plots.length ? plots : undefined,
    };
  } catch (err: any) {
    elapsedSec = startTime > 0 ? (Date.now() - startTime) / 1000 : 0;
    const isTimeout = /timeout|timed out/i.test(err?.message || '');
    const dollarCost = computeSandboxDollarCost(elapsedSec);
    const walletTokensToDeduct = computeSandboxWalletTokens(elapsedSec);
    return {
      success: false,
      stdout: '',
      stderr: '',
      error: {
        kind: isTimeout ? 'timeout' : 'unknown',
        message: err?.message || 'Sandbox execution failed',
      },
      executionTimeSec: elapsedSec,
      dollarCost,
      walletTokensToDeduct,
    };
  } finally {
    if (sandbox) { try { await sandbox.kill(); } catch { /* swallow */ } }
  }
}

// ── HELPERS ─────────────────────────────────────────────────────────

function classifyExecutionError(err: NonNullable<ExecutionRecord['error']>): SandboxErrorKind {
  const name = (err.name || '').toLowerCase();
  const value = (err.value || '').toLowerCase();
  if (name.includes('syntaxerror') || name.includes('indentationerror')) return 'syntax_error';
  if (value.includes('timeout') || value.includes('timed out')) return 'timeout';
  return 'runtime_error';
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n…(${s.length - max} more chars truncated)`;
}

// Re-export the rate so the controller can show users headroom math.
export { TOKEN_BASE_RATE };
