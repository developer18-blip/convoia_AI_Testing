/**
 * Code Tools — find symbols and get diagnostics.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const execAsync = promisify(execFile);
const IGNORED = ['node_modules', '.git', 'dist', '__pycache__', '.next', 'coverage', 'build'];

export function registerCodeTools() {
  return [
    {
      name: 'find_symbol',
      description: 'Find all occurrences of a symbol (function, class, variable) in the codebase. Returns file:line for each match.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          symbol: { type: 'string', description: 'Symbol name to find (e.g., "handleLogin", "UserService")' },
          path: { type: 'string', description: 'Subdirectory to search in (default: entire workspace)' },
        },
        required: ['symbol'],
      },
    },
    {
      name: 'get_diagnostics',
      description: 'Run type checking or linting on a file. Returns errors and warnings.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path to check' },
        },
        required: ['path'],
      },
    },
  ];
}

export async function handleCodeTool(
  name: string, args: Record<string, unknown>, workspaceRoot: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  switch (name) {
    case 'find_symbol': {
      const symbol = String(args.symbol);
      const searchDir = args.path ? path.resolve(workspaceRoot, String(args.path)) : workspaceRoot;

      const files = glob.sync('**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,rb,php}', {
        cwd: searchDir,
        ignore: IGNORED.map(d => `**/${d}/**`),
        nodir: true,
      });

      const results: string[] = [];
      for (const file of files.slice(0, 500)) {
        try {
          const content = fs.readFileSync(path.join(searchDir, file), 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(symbol)) {
              results.push(`${file}:${i + 1}: ${lines[i].trim().substring(0, 150)}`);
              if (results.length >= 50) break;
            }
          }
          if (results.length >= 50) break;
        } catch { /* skip */ }
      }

      return { content: [{ type: 'text', text: results.length > 0 ? results.join('\n') : `No occurrences of "${symbol}" found.` }] };
    }

    case 'get_diagnostics': {
      const filePath = String(args.path);
      const fullPath = path.resolve(workspaceRoot, filePath);
      if (!fs.existsSync(fullPath)) {
        return { content: [{ type: 'text', text: `File not found: ${filePath}` }], isError: true };
      }

      const ext = path.extname(filePath).toLowerCase();
      let output = '';

      try {
        if (['.ts', '.tsx'].includes(ext)) {
          // TypeScript check
          const { stdout, stderr } = await execAsync('npx', ['tsc', '--noEmit', '--pretty', fullPath], {
            cwd: workspaceRoot, timeout: 30000, maxBuffer: 200_000,
          }).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));
          output = (stdout + '\n' + stderr).trim();
        } else if (['.py'].includes(ext)) {
          // Python syntax check
          const { stdout, stderr } = await execAsync('python', ['-m', 'py_compile', fullPath], {
            cwd: workspaceRoot, timeout: 10000,
          }).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));
          output = (stdout + '\n' + stderr).trim() || 'No syntax errors.';
        } else if (['.js', '.jsx'].includes(ext)) {
          // ESLint if available
          const eslintConfig = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml'].some(f =>
            fs.existsSync(path.join(workspaceRoot, f))
          );
          if (eslintConfig) {
            const { stdout, stderr } = await execAsync('npx', ['eslint', '--format', 'compact', fullPath], {
              cwd: workspaceRoot, timeout: 30000,
            }).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));
            output = (stdout + '\n' + stderr).trim();
          } else {
            output = 'No ESLint config found. Run `npm install eslint` and create .eslintrc to enable.';
          }
        } else {
          output = `No diagnostic tool configured for ${ext} files.`;
        }
      } catch (err: any) {
        output = `Diagnostic error: ${err.message}`;
      }

      return { content: [{ type: 'text', text: output || 'No issues found.' }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown code tool: ${name}` }], isError: true };
  }
}
