/**
 * ConvoiaAI REST API Client — connects to the MCP server's REST API.
 * Used when serverMode is 'remote' instead of spawning a local MCP child process.
 */

import axios, { type AxiosInstance } from 'axios';

export class ConvoiaApiClient {
  private http: AxiosInstance;

  constructor(apiServerUrl: string, apiKey: string) {
    this.http = axios.create({
      baseURL: `${apiServerUrl.replace(/\/+$/, '')}/api/v1`,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  // ── Health ───────────────────────────────────────────────────────

  async health(): Promise<{ status: string; tokenBalance: number; workspace: string }> {
    const { data } = await this.http.get('/health');
    return data;
  }

  // ── Tools ────────────────────────────────────────────────────────

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: unknown }>> {
    const { data } = await this.http.get('/tools');
    return data.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const { data } = await this.http.post(`/tools/${name}`, args);
    return data.output || '';
  }

  // ── Resources ────────────────────────────────────────────────────

  async listResources(): Promise<Array<{ uri: string; name: string; description: string }>> {
    const { data } = await this.http.get('/resources');
    return data.resources;
  }

  async getResource(uri: string): Promise<string> {
    // convoia://project/structure → /resources/project/structure
    const path = uri.replace('convoia://', '');
    const { data } = await this.http.get(`/resources/${path}`);
    return typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }

  // ── Prompts ──────────────────────────────────────────────────────

  async listPrompts(): Promise<Array<{ name: string; description: string }>> {
    const { data } = await this.http.get('/prompts');
    return data.prompts;
  }

  async getPrompt(name: string, args: Record<string, string>): Promise<Array<{ role: string; content: string }>> {
    const { data } = await this.http.post(`/prompts/${name}`, args);
    return data.messages;
  }

  // ── Chat (non-streaming) ─────────────────────────────────────────

  async chatSync(params: {
    modelId: string;
    messages: Array<{ role: string; content: string }>;
    thinkMode?: boolean;
  }): Promise<{ response: string; thinking?: string; usage?: { inputTokens: number; outputTokens: number; cost: string } }> {
    const { data } = await this.http.post('/chat/sync', params, { timeout: 120000 });
    return data;
  }

  // ── Chat (streaming) ─────────────────────────────────────────────

  async chatStream(params: {
    modelId: string;
    messages: Array<{ role: string; content: string }>;
    thinkMode?: boolean;
  }): Promise<string> {
    const { data } = await this.http.post('/chat', params, {
      timeout: 120000,
      responseType: 'text',
    });

    // Parse SSE events and collect text
    const lines = String(data).split('\n');
    let result = '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'text') result += parsed.content || '';
      } catch { /* skip */ }
    }
    return result;
  }

  // ── Models & Balance ─────────────────────────────────────────────

  async getModels(): Promise<Array<{ id: string; name: string; modelId: string; provider: string }>> {
    const { data } = await this.http.get('/models');
    return data.models || [];
  }

  async getBalance(): Promise<number> {
    const { data } = await this.http.get('/balance');
    return data.balance || 0;
  }

  // ── Connection test ──────────────────────────────────────────────

  async isConnected(): Promise<boolean> {
    try {
      const h = await this.health();
      return h.status === 'ok';
    } catch {
      return false;
    }
  }
}
