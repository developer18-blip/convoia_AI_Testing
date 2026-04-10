/**
 * MCP Bridge — manages communication with the ConvoiaAI MCP server.
 * Spawns the server as a child process (stdio) or connects remotely (SSE).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as path from 'path';

export class MCPBridge {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private apiKey: string;
  private baseUrl: string;
  private workspaceRoot: string;

  constructor(apiKey: string, baseUrl: string, workspaceRoot: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.workspaceRoot = workspaceRoot;
  }

  async connect(): Promise<void> {
    const serverPath = path.join(__dirname, '..', '..', '..', 'convoia-mcp-server', 'dist', 'index.js');

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
