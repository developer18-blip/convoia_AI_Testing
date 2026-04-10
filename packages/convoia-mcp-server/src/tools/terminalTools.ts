/**
 * Terminal Tools — run commands in the workspace.
 * Local mode: no command restrictions (user's own machine).
 * Uses tree-kill to clean up child processes on timeout.
 */

import { spawn } from 'child_process';
import treeKill from 'tree-kill';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 100_000; // 100KB

export function registerTerminalTools() {
  return [
    {
      name: 'run_command',
      description: 'Run a terminal command in the workspace. Returns stdout, stderr, and exit code. Timeout: 30 seconds.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          command: { type: 'string', description: 'Shell command to execute (e.g., "npm install", "python script.py")' },
          cwd: { type: 'string', description: 'Working directory relative to workspace root (default: workspace root)' },
        },
        required: ['command'],
      },
    },
  ];
}

export async function handleTerminalTool(
  _name: string, args: Record<string, unknown>, workspaceRoot: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const command = String(args.command);
  const cwd = args.cwd ? String(args.cwd) : workspaceRoot;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const child = spawn(command, {
      shell: true,
      cwd,
      timeout: TIMEOUT_MS,
      env: { ...process.env },
    });

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.slice(0, MAX_OUTPUT) + '\n[output truncated at 100KB]';
        if (child.pid) treeKill(child.pid, 'SIGKILL');
        killed = true;
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.slice(0, MAX_OUTPUT) + '\n[stderr truncated]';
      }
    });

    const timer = setTimeout(() => {
      if (child.pid) treeKill(child.pid, 'SIGKILL');
      killed = true;
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      const exitCode = code ?? (killed ? 137 : 1);
      const timeoutMsg = killed ? '\n[Process killed: timeout or output limit exceeded]' : '';

      const output = [
        stdout ? `STDOUT:\n${stdout}` : '',
        stderr ? `STDERR:\n${stderr}` : '',
        `Exit code: ${exitCode}${timeoutMsg}`,
      ].filter(Boolean).join('\n\n');

      resolve({
        content: [{ type: 'text', text: output }],
        isError: exitCode !== 0,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        content: [{ type: 'text', text: `Failed to execute: ${err.message}` }],
        isError: true,
      });
    });
  });
}
