/**
 * Git Tools — status, diff, log, commit, branch operations.
 * All operations run in the workspace directory.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(execFile);
const TIMEOUT = 15_000;
const MAX_DIFF = 10_000;

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execAsync('git', args, { cwd, timeout: TIMEOUT, maxBuffer: 200_000 });
  return stdout.trim();
}

export function registerGitTools() {
  return [
    {
      name: 'git_status',
      description: 'Show git status: current branch, staged/unstaged changes, untracked files.',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'git_diff',
      description: 'Show git diff of uncommitted changes. Use staged=true for staged changes only.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          staged: { type: 'boolean', description: 'Show only staged changes' },
        },
      },
    },
    {
      name: 'git_log',
      description: 'Show recent git commit history.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          count: { type: 'number', description: 'Number of commits (default: 10, max: 50)' },
        },
      },
    },
    {
      name: 'git_commit',
      description: 'Stage all changes and create a git commit.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          message: { type: 'string', description: 'Commit message' },
        },
        required: ['message'],
      },
    },
    {
      name: 'git_branch_list',
      description: 'List all git branches (local and remote).',
      inputSchema: { type: 'object' as const, properties: {} },
    },
    {
      name: 'git_checkout',
      description: 'Switch to a branch. Set create=true to create a new branch.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          branch: { type: 'string', description: 'Branch name' },
          create: { type: 'boolean', description: 'Create new branch' },
        },
        required: ['branch'],
      },
    },
  ];
}

export async function handleGitTool(
  name: string, args: Record<string, unknown>, workspaceRoot: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'git_status': {
        const branch = await runGit(['branch', '--show-current'], workspaceRoot);
        const status = await runGit(['status', '--porcelain'], workspaceRoot);
        const text = `Branch: ${branch}\n\n${status || '(clean — no changes)'}`;
        return { content: [{ type: 'text', text }] };
      }

      case 'git_diff': {
        const diffArgs = args.staged ? ['diff', '--staged'] : ['diff'];
        let diff = await runGit(diffArgs, workspaceRoot);
        if (diff.length > MAX_DIFF) {
          diff = diff.slice(0, MAX_DIFF) + '\n\n[diff truncated at 10,000 chars]';
        }
        return { content: [{ type: 'text', text: diff || '(no changes)' }] };
      }

      case 'git_log': {
        const count = Math.min(Number(args.count) || 10, 50);
        const log = await runGit(['log', `--oneline`, `-${count}`], workspaceRoot);
        return { content: [{ type: 'text', text: log || '(no commits)' }] };
      }

      case 'git_commit': {
        const message = String(args.message);
        await runGit(['add', '-A'], workspaceRoot);
        const result = await runGit(['commit', '-m', message], workspaceRoot);
        return { content: [{ type: 'text', text: result }] };
      }

      case 'git_branch_list': {
        const branches = await runGit(['branch', '-a'], workspaceRoot);
        return { content: [{ type: 'text', text: branches }] };
      }

      case 'git_checkout': {
        const branch = String(args.branch);
        const gitArgs = args.create ? ['checkout', '-b', branch] : ['checkout', branch];
        const result = await runGit(gitArgs, workspaceRoot);
        return { content: [{ type: 'text', text: result || `Switched to ${branch}` }] };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown git tool: ${name}` }], isError: true };
    }
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Git error: ${err.message}` }], isError: true };
  }
}
