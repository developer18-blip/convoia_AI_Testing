/**
 * MCP Bridge — manages communication with the ConvoiaAI MCP server.
 * Spawns the server as a child process (stdio) or connects remotely (SSE).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';
import * as fs from 'fs';

export class MCPBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private apiKey: string;
  private baseUrl: string;
  private workspaceRoot: string;
  private customServerPath?: string;

  constructor(apiKey: string, baseUrl: string, workspaceRoot: string, customServerPath?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.workspaceRoot = workspaceRoot;
    this.customServerPath = customServerPath;
  }

  private findServerPath(): string {
    // 1. Custom path from settings
    if (this.customServerPath && fs.existsSync(this.customServerPath)) {
      return this.customServerPath;
    }

    // 2. Workspace-relative (monorepo): <workspace>/packages/convoia-mcp-server/dist/index.js
    const workspacePath = path.join(this.workspaceRoot, 'packages', 'convoia-mcp-server', 'dist', 'index.js');
    if (fs.existsSync(workspacePath)) return workspacePath;

    // 3. Sibling to workspace: <parent>/convoia-mcp-server/dist/index.js
    const siblingPath = path.join(this.workspaceRoot, '..', 'convoia-mcp-server', 'dist', 'index.js');
    if (fs.existsSync(siblingPath)) return siblingPath;

    // 4. Global npx — try convoia-mcp command
    // Falls through to spawn with 'npx convoia-mcp' if none found
    const extensionRelative = path.join(__dirname, '..', '..', '..', 'convoia-mcp-server', 'dist', 'index.js');
    if (fs.existsSync(extensionRelative)) return extensionRelative;

    throw new Error(
      'ConvoiaAI MCP server not found. Install it:\n' +
      '  1. cd packages/convoia-mcp-server && npm install && npm run build\n' +
      '  2. Or set "convoia.mcpServerPath" in VS Code settings\n' +
      '  3. Or use remote mode: set "convoia.serverMode" to "remote"'
    );
  }

  async connect(): Promise<void> {
    const serverPath = this.findServerPath();

    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: {
        ...process.env,
        CONVOIA_API_KEY: this.apiKey,
        CONVOIA_API_URL: this.baseUrl,
        CONVOIA_WORKSPACE: this.workspaceRoot,
      },
    });

    this.client = new Client(
      { name: 'convoia-vscode', version: '0.1.0' },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: unknown }>> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    return content.filter(c => c.type === 'text').map(c => c.text || '').join('\n');
  }

  async getResource(uri: string): Promise<string> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.readResource({ uri });
    return result.contents.map((c: any) => c.text || '').join('\n');
  }

  async getPrompt(name: string, args: Record<string, string>): Promise<Array<{ role: string; content: string }>> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.getPrompt({ name, arguments: args });
    return result.messages.map((m: any) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content?.text || '',
    }));
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}
