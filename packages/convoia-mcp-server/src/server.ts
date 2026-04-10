/**
 * ConvoiaAI MCP Server — core server class.
 *
 * Implements the Model Context Protocol with:
 * - Tools: file ops, terminal, git, search, code analysis
 * - Resources: project structure, tech stack, open files
 * - Prompts: explain, refactor, test, review templates
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { registerFileTools, handleFileTool } from './tools/fileTools.js';
import { registerTerminalTools, handleTerminalTool } from './tools/terminalTools.js';
import { registerGitTools, handleGitTool } from './tools/gitTools.js';
import { registerSearchTools, handleSearchTool } from './tools/searchTools.js';
import { registerCodeTools, handleCodeTool } from './tools/codeTools.js';
import { getProjectStructure, getTechStack } from './resources/projectContext.js';
import { getOpenFiles, setOpenFiles } from './resources/openFiles.js';

export class ConvoiaMCPServer {
  private server: Server;
  private workspaceRoot: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string, workspaceRoot?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.workspaceRoot = workspaceRoot || process.cwd();

    this.server = new Server(
      { name: 'convoia-dev-agent', version: '0.1.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );

    this.registerToolHandlers();
    this.registerResourceHandlers();
    this.registerPromptHandlers();

    this.server.onerror = (error) => {
      console.error('[ConvoiaAI MCP] Server error:', error);
    };
  }

  getServer(): Server {
    return this.server;
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  updateOpenFiles(files: Array<{ path: string; language: string; lineCount: number; dirty: boolean }>): void {
    setOpenFiles(files);
  }

  // ── Tools ──────────────────────────────────────────────────────────

  private registerToolHandlers(): void {
    // List all available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          ...registerFileTools(),
          ...registerTerminalTools(),
          ...registerGitTools(),
          ...registerSearchTools(this.apiKey, this.baseUrl),
          ...registerCodeTools(),
        ],
      };
    });

    // Execute a tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const safeArgs = (args || {}) as Record<string, unknown>;

      try {
        // Route to the correct tool handler
        if (name.startsWith('read_file') || name.startsWith('write_file') || name.startsWith('edit_file') ||
            name.startsWith('list_directory') || name.startsWith('search_files') || name.startsWith('delete_file')) {
          return handleFileTool(name, safeArgs, this.workspaceRoot);
        }
        if (name === 'run_command') {
          return handleTerminalTool(name, safeArgs, this.workspaceRoot);
        }
        if (name.startsWith('git_')) {
          return handleGitTool(name, safeArgs, this.workspaceRoot);
        }
        if (name === 'web_search') {
          return handleSearchTool(name, safeArgs, this.apiKey, this.baseUrl);
        }
        if (name === 'find_symbol' || name === 'get_diagnostics') {
          return handleCodeTool(name, safeArgs, this.workspaceRoot);
        }

        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Tool error: ${err.message}` }], isError: true };
      }
    });
  }

  // ── Resources ──────────────────────────────────────────────────────

  private registerResourceHandlers(): void {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          { uri: 'convoia://project/structure', name: 'Project Structure', description: 'File tree of the workspace', mimeType: 'text/plain' },
          { uri: 'convoia://project/techstack', name: 'Tech Stack', description: 'Detected languages, frameworks, and dependencies', mimeType: 'application/json' },
          { uri: 'convoia://editor/open-files', name: 'Open Files', description: 'Currently open files in the editor', mimeType: 'application/json' },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'convoia://project/structure') {
        const structure = await getProjectStructure(this.workspaceRoot);
        return { contents: [{ uri, mimeType: 'text/plain', text: structure }] };
      }
      if (uri === 'convoia://project/techstack') {
        const stack = await getTechStack(this.workspaceRoot);
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(stack, null, 2) }] };
      }
      if (uri === 'convoia://editor/open-files') {
        const files = getOpenFiles();
        return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(files, null, 2) }] };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  // ── Prompts ────────────────────────────────────────────────────────

  private registerPromptHandlers(): void {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'explain_code',
            description: 'Explain selected code in detail',
            arguments: [
              { name: 'code', description: 'The code to explain', required: true },
              { name: 'language', description: 'Programming language', required: false },
            ],
          },
          {
            name: 'refactor_code',
            description: 'Suggest refactoring improvements',
            arguments: [
              { name: 'code', description: 'The code to refactor', required: true },
              { name: 'language', description: 'Programming language', required: false },
              { name: 'goal', description: 'Refactoring goal (readability, performance, etc)', required: false },
            ],
          },
          {
            name: 'write_tests',
            description: 'Generate unit tests for code',
            arguments: [
              { name: 'code', description: 'The code to test', required: true },
              { name: 'language', description: 'Programming language', required: false },
              { name: 'framework', description: 'Test framework (jest, vitest, pytest, etc)', required: false },
            ],
          },
          {
            name: 'review_code',
            description: 'Code review with bug detection and suggestions',
            arguments: [
              { name: 'code', description: 'The code to review', required: true },
              { name: 'language', description: 'Programming language', required: false },
            ],
          },
          {
            name: 'fix_error',
            description: 'Fix a code error based on diagnostics',
            arguments: [
              { name: 'error', description: 'The error message', required: true },
              { name: 'code', description: 'The code with the error', required: true },
              { name: 'file', description: 'File path', required: false },
            ],
          },
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const safeArgs = (args || {}) as Record<string, string>;

      const promptMap: Record<string, () => { messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }> }> = {
        explain_code: () => ({
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Explain this ${safeArgs.language || ''} code in detail. What does it do, how does it work, and are there any potential issues?\n\n\`\`\`${safeArgs.language || ''}\n${safeArgs.code}\n\`\`\`` },
          }],
        }),
        refactor_code: () => ({
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Refactor this ${safeArgs.language || ''} code${safeArgs.goal ? ` to improve ${safeArgs.goal}` : ''}. Show the improved version with explanations.\n\n\`\`\`${safeArgs.language || ''}\n${safeArgs.code}\n\`\`\`` },
          }],
        }),
        write_tests: () => ({
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Write comprehensive unit tests for this ${safeArgs.language || ''} code${safeArgs.framework ? ` using ${safeArgs.framework}` : ''}. Cover edge cases.\n\n\`\`\`${safeArgs.language || ''}\n${safeArgs.code}\n\`\`\`` },
          }],
        }),
        review_code: () => ({
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Review this ${safeArgs.language || ''} code. Find bugs, security issues, performance problems, and suggest improvements.\n\n\`\`\`${safeArgs.language || ''}\n${safeArgs.code}\n\`\`\`` },
          }],
        }),
        fix_error: () => ({
          messages: [{
            role: 'user',
            content: { type: 'text', text: `Fix this error${safeArgs.file ? ` in ${safeArgs.file}` : ''}:\n\nError: ${safeArgs.error}\n\nCode:\n\`\`\`\n${safeArgs.code}\n\`\`\`\n\nProvide the corrected code and explain the fix.` },
          }],
        }),
      };

      const builder = promptMap[name];
      if (!builder) throw new Error(`Unknown prompt: ${name}`);
      return builder();
    });
  }
}
