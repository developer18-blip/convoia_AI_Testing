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
  apiKeys?: Record<string, string>
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
    default:
      return { success: false, output: null, error: `Unknown tool: ${toolName}`, durationMs: 0 };
  }
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
];
