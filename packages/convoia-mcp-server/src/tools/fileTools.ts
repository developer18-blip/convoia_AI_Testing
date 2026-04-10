/**
 * File Tools — read, write, edit, list, search, delete files in workspace.
 * All paths validated against workspaceRoot to prevent traversal.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const IGNORED_DIRS = ['node_modules', '.git', 'dist', '__pycache__', '.next', '.nuxt', 'coverage', '.cache', 'build', '.svelte-kit'];

function validatePath(workspaceRoot: string, filePath: string): string {
  const resolved = path.resolve(workspaceRoot, filePath);
  if (!resolved.startsWith(path.resolve(workspaceRoot))) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
  return resolved;
}

export function registerFileTools() {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file. Returns the file content as text.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
        },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: 'Create or overwrite a file. Creates parent directories if needed.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact string match. The old_string must appear exactly once in the file.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          old_string: { type: 'string', description: 'Exact string to find and replace (must appear exactly once)' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'list_directory',
      description: 'List files and directories. Ignores node_modules, .git, dist.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'Directory path relative to workspace root (default: ".")' },
          recursive: { type: 'boolean', description: 'List recursively (max depth 4)' },
        },
      },
    },
    {
      name: 'search_files',
      description: 'Search for files by name pattern or content. Returns matching file paths.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          pattern: { type: 'string', description: 'Glob pattern for filenames (e.g., "**/*.ts") or text to search in content' },
          path: { type: 'string', description: 'Directory to search in (default: workspace root)' },
          content_search: { type: 'boolean', description: 'If true, searches file contents instead of names' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'delete_file',
      description: 'Delete a file or empty directory.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string', description: 'File path to delete' },
        },
        required: ['path'],
      },
    },
  ];
}

export function handleFileTool(
  name: string, args: Record<string, unknown>, workspaceRoot: string
): { content: Array<{ type: string; text: string }>; isError?: boolean } {
  switch (name) {
    case 'read_file': {
      const filePath = validatePath(workspaceRoot, String(args.path));
      if (!fs.existsSync(filePath)) return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true };
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return { content: [{ type: 'text', text: `File too large: ${(stat.size / 1024).toFixed(0)}KB (max ${MAX_FILE_SIZE / 1024}KB)` }], isError: true };
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content: [{ type: 'text', text: content }] };
    }

    case 'write_file': {
      const filePath = validatePath(workspaceRoot, String(args.path));
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(filePath, String(args.content), 'utf-8');
      return { content: [{ type: 'text', text: `File written: ${args.path} (${Buffer.byteLength(String(args.content))} bytes)` }] };
    }

    case 'edit_file': {
      const filePath = validatePath(workspaceRoot, String(args.path));
      if (!fs.existsSync(filePath)) return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true };
      const content = fs.readFileSync(filePath, 'utf-8');
      const oldStr = String(args.old_string);
      const occurrences = content.split(oldStr).length - 1;
      if (occurrences === 0) return { content: [{ type: 'text', text: `old_string not found in ${args.path}` }], isError: true };
      if (occurrences > 1) return { content: [{ type: 'text', text: `old_string appears ${occurrences} times in ${args.path}. Must be unique.` }], isError: true };
      const newContent = content.replace(oldStr, String(args.new_string));
      fs.writeFileSync(filePath, newContent, 'utf-8');
      const lineNum = content.substring(0, content.indexOf(oldStr)).split('\n').length;
      return { content: [{ type: 'text', text: `Edited ${args.path} at line ${lineNum}` }] };
    }

    case 'list_directory': {
      const dirPath = validatePath(workspaceRoot, String(args.path || '.'));
      if (!fs.existsSync(dirPath)) return { content: [{ type: 'text', text: `Directory not found: ${args.path}` }], isError: true };
      const recursive = args.recursive === true;
      const tree = buildTree(dirPath, workspaceRoot, recursive ? 4 : 1, 0);
      return { content: [{ type: 'text', text: tree }] };
    }

    case 'search_files': {
      const searchDir = validatePath(workspaceRoot, String(args.path || '.'));
      const pattern = String(args.pattern);
      const contentSearch = args.content_search === true;

      if (contentSearch) {
        const results = grepFiles(searchDir, pattern, workspaceRoot);
        return { content: [{ type: 'text', text: results || 'No matches found.' }] };
      } else {
        const matches = glob.sync(pattern, {
          cwd: searchDir,
          ignore: IGNORED_DIRS.map(d => `**/${d}/**`),
          nodir: true,
        }).slice(0, 50);
        return { content: [{ type: 'text', text: matches.length > 0 ? matches.join('\n') : 'No matches found.' }] };
      }
    }

    case 'delete_file': {
      const filePath = validatePath(workspaceRoot, String(args.path));
      if (!fs.existsSync(filePath)) return { content: [{ type: 'text', text: `File not found: ${args.path}` }], isError: true };
      if (fs.statSync(filePath).isDirectory()) {
        fs.rmSync(filePath, { recursive: true });
      } else {
        fs.unlinkSync(filePath);
      }
      return { content: [{ type: 'text', text: `Deleted: ${args.path}` }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown file tool: ${name}` }], isError: true };
  }
}

function buildTree(dir: string, root: string, maxDepth: number, depth: number): string {
  if (depth >= maxDepth) return '';
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !IGNORED_DIRS.includes(e.name) && !e.name.startsWith('.'))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));

  let result = '';
  const indent = '  '.repeat(depth);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result += `${indent}📁 ${entry.name}/\n`;
      result += buildTree(fullPath, root, maxDepth, depth + 1);
    } else {
      const size = fs.statSync(fullPath).size;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(0)}KB` : `${size}B`;
      result += `${indent}📄 ${entry.name} (${sizeStr})\n`;
    }
  }
  return result;
}

function grepFiles(dir: string, pattern: string, root: string): string {
  const results: string[] = [];
  const files = glob.sync('**/*', { cwd: dir, nodir: true, ignore: IGNORED_DIRS.map(d => `**/${d}/**`) });

  for (const file of files.slice(0, 500)) {
    const fullPath = path.join(dir, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
          const relPath = path.relative(root, fullPath);
          results.push(`${relPath}:${i + 1}: ${lines[i].trim().substring(0, 200)}`);
          if (results.length >= 50) return results.join('\n');
        }
      }
    } catch { /* skip binary/unreadable files */ }
  }
  return results.join('\n');
}
