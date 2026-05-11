/**
 * Agent Tools — Sandboxed file, terminal, git, and web search operations
 *
 * SECURITY: All operations are sandboxed to /tmp/convoia-workspaces/{userId}/{projectId}/
 * Path traversal is blocked. Terminal has strict allowlist. 50MB disk limit per project.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../config/logger.js';
import {
  executePython,
  worstCaseWalletTokens,
  acquireSlot,
  releaseSlot,
} from './sandboxService.js';
import { TokenWalletService } from './tokenWalletService.js';

const execFileAsync = promisify(execFile);

// ── Constants ────────────────────────────────────────────────────────

const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE_ROOT || '/tmp/convoia-workspaces';
const MAX_DISK_PER_PROJECT = 50 * 1024 * 1024; // 50MB
const TOOL_TIMEOUT_MS = 30_000; // 30s per tool
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file read/write
const MAX_OUTPUT_SIZE = 100_000; // 100KB max output from terminal

// Terminal allowlist — only these executables are permitted
const ALLOWED_EXECUTABLES = new Set([
  'node', 'npm', 'npx', 'yarn', 'pnpm',
  'python', 'python3', 'pip', 'pip3',
  'tsc', 'eslint', 'prettier',
  'cat', 'head', 'tail', 'wc', 'grep', 'find',
  'ls', 'mkdir', 'cp', 'mv', 'touch', 'echo',
  'git', 'diff', 'sort', 'uniq', 'tr', 'sed', 'awk',
  'which', 'env', 'printenv',
  'tree', 'du', 'df',
]);

// These patterns in commands are always blocked
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//,        // rm -rf /
  /\bsudo\b/,               // sudo
  /\bcurl\b/,               // curl (network access)
  /\bwget\b/,               // wget
  /\bssh\b/,                // ssh
  /\bscp\b/,                // scp
  /\bnc\b/,                 // netcat
  /\btelnet\b/,             // telnet
  /\bchmod\s+[0-7]*s/,      // setuid
  /\bchown\b/,              // chown
  /\b(>|>>)\s*\/(?!tmp)/,   // redirect to system paths
  /\bkill\b/,               // kill processes
  /\bpkill\b/,              // pkill
  /\bshutdown\b/,           // shutdown
  /\breboot\b/,             // reboot
];

// ── Types ────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

export interface TerminalResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ToolResult {
  success: boolean;
  output: any;
  error?: string;
  durationMs: number;
}

// ── Sandbox Validation ───────────────────────────────────────────────

function getSandboxRoot(userId: string, projectId: string): string {
  // Validate IDs to prevent injection
  if (!/^[a-zA-Z0-9\-]+$/.test(userId) || !/^[a-zA-Z0-9\-]+$/.test(projectId)) {
    throw new Error('Invalid userId or projectId format');
  }
  return path.join(WORKSPACE_ROOT, userId, projectId);
}

function validatePath(sandboxRoot: string, requestedPath: string): string {
  const resolved = path.resolve(sandboxRoot, requestedPath);
  if (!resolved.startsWith(sandboxRoot)) {
    throw new Error(`Path traversal blocked: ${requestedPath} resolves outside sandbox`);
  }
  return resolved;
}

function ensureSandboxExists(sandboxRoot: string): void {
  if (!fs.existsSync(sandboxRoot)) {
    fs.mkdirSync(sandboxRoot, { recursive: true });
  }
}

async function checkDiskUsage(dir: string): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await checkDiskUsage(fullPath);
    } else if (entry.isFile()) {
      try {
        total += fs.statSync(fullPath).size;
      } catch { /* skip inaccessible files */ }
    }
  }
  return total;
}

// ── File Operations ──────────────────────────────────────────────────

export async function fileRead(
  userId: string, projectId: string, filePath: string
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const root = getSandboxRoot(userId, projectId);
    const resolved = validatePath(root, filePath);

    if (!fs.existsSync(resolved)) {
      return { success: false, output: null, error: `File not found: ${filePath}`, durationMs: Date.now() - start };
    }

    const stat = fs.statSync(resolved);
    if (stat.size > MAX_FILE_SIZE) {
      return { success: false, output: null, error: `File too large (${(stat.size / 1024).toFixed(0)}KB, max ${MAX_FILE_SIZE / 1024}KB)`, durationMs: Date.now() - start };
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    return { success: true, output: content, durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, output: null, error: err.message, durationMs: Date.now() - start };
  }
}

export async function fileWrite(
  userId: string, projectId: string, filePath: string, content: string
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const root = getSandboxRoot(userId, projectId);
    ensureSandboxExists(root);
    const resolved = validatePath(root, filePath);

    // Check content size
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_FILE_SIZE) {
      return { success: false, output: null, error: `Content too large (${(contentSize / 1024).toFixed(0)}KB, max ${MAX_FILE_SIZE / 1024}KB)`, durationMs: Date.now() - start };
    }

    // Check disk limit
    const currentUsage = await checkDiskUsage(root);
    if (currentUsage + contentSize > MAX_DISK_PER_PROJECT) {
      return { success: false, output: null, error: `Disk limit exceeded (${(currentUsage / 1024 / 1024).toFixed(1)}MB / ${MAX_DISK_PER_PROJECT / 1024 / 1024}MB)`, durationMs: Date.now() - start };
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(resolved);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true, output: `File written: ${filePath} (${contentSize} bytes)`, durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, output: null, error: err.message, durationMs: Date.now() - start };
  }
}

export async function fileList(
  userId: string, projectId: string, directory: string = '.'
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const root = getSandboxRoot(userId, projectId);
    ensureSandboxExists(root);
    const resolved = validatePath(root, directory);

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return { success: false, output: null, error: `Directory not found: ${directory}`, durationMs: Date.now() - start };
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const files: FileEntry[] = entries.map(entry => {
      const entryPath = path.join(resolved, entry.name);
      const stat = fs.statSync(entryPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' as const : 'file' as const,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      };
    });

    return { success: true, output: files, durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, output: null, error: err.message, durationMs: Date.now() - start };
  }
}

export async function fileDelete(
  userId: string, projectId: string, filePath: string
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const root = getSandboxRoot(userId, projectId);
    const resolved = validatePath(root, filePath);

    if (!fs.existsSync(resolved)) {
      return { success: false, output: null, error: `File not found: ${filePath}`, durationMs: Date.now() - start };
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true });
    } else {
      fs.unlinkSync(resolved);
    }

    return { success: true, output: `Deleted: ${filePath}`, durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, output: null, error: err.message, durationMs: Date.now() - start };
  }
}

// ── Terminal Execution ───────────────────────────────────────────────

export async function terminalExec(
  userId: string, projectId: string, command: string
): Promise<ToolResult> {
  const start = Date.now();
  try {
    const root = getSandboxRoot(userId, projectId);
    ensureSandboxExists(root);

    // Parse command into executable + args
    const parts = command.trim().split(/\s+/);
    const executable = parts[0];
    const args = parts.slice(1);

    // Security: check allowlist
    if (!ALLOWED_EXECUTABLES.has(executable)) {
      return { success: false, output: null, error: `Blocked: '${executable}' is not in the allowlist`, durationMs: Date.now() - start };
    }

    // Security: check blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { success: false, output: null, error: `Blocked: command contains a prohibited pattern`, durationMs: Date.now() - start };
      }
    }

    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: root,
      timeout: TOOL_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_SIZE,
      env: {
        ...process.env,
        HOME: root,
        PATH: process.env.PATH,
        NODE_ENV: 'development',
      },
    });

    const truncatedStdout = stdout.length > MAX_OUTPUT_SIZE
      ? stdout.slice(0, MAX_OUTPUT_SIZE) + '\n[output truncated]'
      : stdout;

    return {
      success: true,
      output: { stdout: truncatedStdout, stderr: stderr.slice(0, 10000) },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      output: { stdout: err.stdout?.slice(0, MAX_OUTPUT_SIZE) || '', stderr: err.stderr?.slice(0, 10000) || '' },
      error: err.message,
      durationMs: Date.now() - start,
    };
  }
}

// ── Git Operations ───────────────────────────────────────────────────

export async function gitInit(userId: string, projectId: string): Promise<ToolResult> {
  return terminalExec(userId, projectId, 'git init');
}

export async function gitStatus(userId: string, projectId: string): Promise<ToolResult> {
  return terminalExec(userId, projectId, 'git status --short');
}

export async function gitDiff(userId: string, projectId: string): Promise<ToolResult> {
  return terminalExec(userId, projectId, 'git diff');
}

export async function gitLog(userId: string, projectId: string, n: number = 10): Promise<ToolResult> {
  return terminalExec(userId, projectId, `git log --oneline -${Math.min(n, 50)}`);
}

export async function gitCommit(userId: string, projectId: string, message: string): Promise<ToolResult> {
  const start = Date.now();
  try {
    const root = getSandboxRoot(userId, projectId);
    ensureSandboxExists(root);

    // Stage all changes
    await execFileAsync('git', ['add', '-A'], { cwd: root, timeout: TOOL_TIMEOUT_MS });
    // Commit
    const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: root, timeout: TOOL_TIMEOUT_MS });

    return { success: true, output: stdout, durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, output: null, error: err.message, durationMs: Date.now() - start };
  }
}

// ── Web Search ───────────────────────────────────────────────────────

export async function webSearch(query: string, apiKey?: string): Promise<ToolResult> {
  const start = Date.now();
  try {
    // Use Perplexity Sonar for web search if API key available
    if (apiKey) {
      const axios = (await import('axios')).default;
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: 'sonar',
          messages: [{ role: 'user', content: query }],
          max_tokens: 1000,
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        }
      );
      const text = response.data.choices?.[0]?.message?.content || '';
      const citations = response.data.citations || [];
      return { success: true, output: { answer: text, citations }, durationMs: Date.now() - start };
    }

    // Fallback: no search available
    return { success: false, output: null, error: 'No search API key configured', durationMs: Date.now() - start };
  } catch (err: any) {
    return { success: false, output: null, error: err.message, durationMs: Date.now() - start };
  }
}

// ── Tool Executor (dispatch) ─────────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: Record<string, any>,
  userId: string,
  projectId: string,
  apiKeys?: Record<string, string>,
  organizationId?: string,
): Promise<ToolResult> {
  logger.info(`Tool execution: ${toolName} by user ${userId}, project ${projectId}`);

  switch (toolName) {
    case 'file_read':
      return fileRead(userId, projectId, input.path);
    case 'file_write':
      return fileWrite(userId, projectId, input.path, input.content);
    case 'file_list':
      return fileList(userId, projectId, input.directory || '.');
    case 'file_delete':
      return fileDelete(userId, projectId, input.path);
    case 'terminal_exec':
      return terminalExec(userId, projectId, input.command);
    case 'web_search':
      return webSearch(input.query, apiKeys?.perplexity);
    case 'git_init':
      return gitInit(userId, projectId);
    case 'git_status':
      return gitStatus(userId, projectId);
    case 'git_diff':
      return gitDiff(userId, projectId);
    case 'git_log':
      return gitLog(userId, projectId, input.count || 10);
    case 'git_commit':
      return gitCommit(userId, projectId, input.message);
    case 'execute_python':
      return executePythonTool(userId, organizationId, input.code, {});
    default:
      return { success: false, output: null, error: `Unknown tool: ${toolName}`, durationMs: 0 };
  }
}

// ── execute_python handler ───────────────────────────────────────────
//
// Wraps sandboxService.executePython with: wallet pre-flight (worst-case
// 30s ≈ 586 wallet tokens), service-level concurrency guard (single
// inFlight per user across the API + agent tool paths), and the Day 1
// billing rule (no charge on provision failure, charge for elapsed
// seconds otherwise).
//
// Returns an orchestrator-shaped ToolResult — never throws. Errors
// surface as { success: false, error: string } so the LLM can read
// stderr and decide whether to retry.
//
// The `deps` parameter exists for tests — production code calls this
// with an empty object and gets the real wallet / sandbox / slot
// implementations. See agentTools.test.ts for the injection pattern.
export interface ExecutePythonToolDeps {
  getBalance?: (userId: string) => Promise<{ tokenBalance: number }>;
  deductTokens?: (args: {
    userId: string; tokens: number; reference: string;
    description: string; organizationId?: string;
  }) => Promise<number>;
  runSandbox?: typeof executePython;
  acquire?: typeof acquireSlot;
  release?: typeof releaseSlot;
}

export async function executePythonTool(
  userId: string,
  organizationId: string | undefined,
  code: unknown,
  deps: ExecutePythonToolDeps = {},
): Promise<ToolResult> {
  const getBalance   = deps.getBalance   ?? TokenWalletService.getBalance.bind(TokenWalletService);
  const deductTokens = deps.deductTokens ?? TokenWalletService.deductTokens.bind(TokenWalletService);
  const runSandbox   = deps.runSandbox   ?? executePython;
  const acquire      = deps.acquire      ?? acquireSlot;
  const release      = deps.release      ?? releaseSlot;

  const startedAt = Date.now();

  if (typeof code !== 'string' || code.length === 0) {
    return {
      success: false,
      output: null,
      error: 'execute_python requires a "code" string parameter.',
      durationMs: Date.now() - startedAt,
    };
  }

  // 1. Wallet pre-flight (worst-case 30s cost)
  const worstCase = worstCaseWalletTokens();
  const balance = await getBalance(userId);
  if (balance.tokenBalance < worstCase) {
    return {
      success: false,
      output: null,
      error: `Insufficient tokens — Code Interpreter needs ~${worstCase} tokens per run, you have ${balance.tokenBalance}. Tell the user to top up their wallet to use this tool.`,
      durationMs: Date.now() - startedAt,
    };
  }

  // 2. Concurrency guard — single inflight per user, shared with the
  //    POST /api/sandbox/execute-python controller.
  if (!acquire(userId)) {
    return {
      success: false,
      output: null,
      error: 'A previous sandbox run is still active. Wait for it to finish, then try again.',
      durationMs: Date.now() - startedAt,
    };
  }

  // 3. Execute
  let result;
  try {
    result = await runSandbox(code);
  } finally {
    release(userId);
  }

  // 4. Bill (skip on provision failure — Day 1 rule).
  if (result.walletTokensToDeduct > 0 && result.error?.kind !== 'provision') {
    await deductTokens({
      userId,
      tokens: result.walletTokensToDeduct,
      reference: `sandbox-py-${Date.now()}`,
      description: `Python sandbox (${result.executionTimeSec.toFixed(2)}s, via execute_python)`,
      organizationId,
    });
  }

  // 5. Shape for the orchestrator. On success, output is a structured
  //    object so JSON.stringify gives the LLM the field names. On
  //    failure, error is a single string carrying kind + message +
  //    traceback for the LLM's retry loop.
  if (result.success) {
    return {
      success: true,
      output: {
        stdout: result.stdout,
        stderr: result.stderr,
        executionTimeSec: Number(result.executionTimeSec.toFixed(2)),
      },
      durationMs: Math.round(result.executionTimeSec * 1000),
    };
  }
  return {
    success: false,
    output: null,
    error: result.error
      ? `[${result.error.kind}] ${result.error.message}${result.error.traceback ? '\n\nTraceback:\n' + result.error.traceback : ''}`
      : 'Sandbox execution failed',
    durationMs: Math.round(result.executionTimeSec * 1000),
  };
}

// ── Tool Definitions (for LLM function calling) ──────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'file_read',
    description: 'Read the contents of a file in the project workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path within the project (e.g., "src/index.ts")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'file_write',
    description: 'Create or overwrite a file in the project workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path within the project' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'file_list',
    description: 'List files and directories in the project workspace',
    parameters: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Relative directory path (default: project root)', default: '.' },
      },
    },
  },
  {
    name: 'file_delete',
    description: 'Delete a file or directory from the project workspace',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path to delete' },
      },
      required: ['path'],
    },
  },
  {
    name: 'terminal_exec',
    description: 'Run a terminal command in the project workspace. Allowed: node, npm, npx, python, tsc, eslint, git, ls, mkdir, cat, grep, find. Blocked: curl, wget, sudo, ssh.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute (e.g., "npm install express")' },
      },
      required: ['command'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for documentation, Stack Overflow answers, or API references',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (be specific, e.g., "Express.js middleware error handling best practices 2026")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'git_init',
    description: 'Initialize a new git repository in the project workspace',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_status',
    description: 'Show git status of the project workspace',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_diff',
    description: 'Show git diff of uncommitted changes',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'git_log',
    description: 'Show recent git commit history',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of commits to show (default: 10, max: 50)', default: 10 },
      },
    },
  },
  {
    name: 'git_commit',
    description: 'Stage all changes and commit with a message',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
      },
      required: ['message'],
    },
  },
  {
    name: 'execute_python',
    description: `Execute Python 3 code in an isolated cloud sandbox. Use when running real code gives a more accurate answer than guessing.

WHEN TO USE:
- Numerical computation the user asks for (stats, formulas, regex on real input)
- Data analysis on user-provided data (CSV, JSON, tables pasted in chat)
- Plotting / charts / visualizations (matplotlib, seaborn)
- Math problems requiring exact computation
- Verifying an answer you'd otherwise estimate

WHEN NOT TO USE:
- General questions you already know the answer to ("what's 2+2", "explain X")
- Opinion or recommendation requests
- Code review or explanation (write markdown, don't run code)
- Conversational replies

EXECUTION MODEL — READ THIS:
- Each call provisions a FRESH sandbox. Variables, imports, files from a previous call DO NOT EXIST.
- Write self-contained code: imports + data setup + computation + print() — all in ONE call.
- 30-second timeout. 10,000-character code limit. ~30s = ~586 wallet tokens worst case.
- Pre-installed: numpy, pandas, matplotlib, seaborn, scipy, scikit-learn, statsmodels, requests, beautifulsoup4, pillow.

ERROR HANDLING:
- If success=false, read stderr / error.traceback, fix your code, call again. Try up to 2 retries (3 total attempts).
- After 3 total attempts, stop retrying and explain to the user what went wrong in plain English.

OUTPUT DISCIPLINE:
- Use print() — final expressions are NOT auto-echoed.
- Print only what the user needs. Summarize dataframes (head + shape + stats), don't dump full tables.
- For plots: matplotlib -> savefig to BytesIO -> base64 -> print("PLOT_BASE64: " + b64). The system prompt explains how to embed it in your response.`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Self-contained Python 3 code. IMPORTANT: each call runs in a fresh sandbox — variables, imports, and files from previous calls are NOT preserved. Include every import and data setup needed for this specific call.',
        },
      },
      required: ['code'],
    },
  },
];
