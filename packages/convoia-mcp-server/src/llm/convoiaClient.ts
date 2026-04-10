/**
 * ConvoiaAI LLM Client — communicates with the ConvoiaAI API.
 * Handles model listing, balance checking, and chat with tool execution.
 */

import axios from 'axios';

interface Model {
  id: string;
  name: string;
  modelId: string;
  provider: string;
  capabilities: string[];
}

interface StreamEvent {
  type: 'text' | 'tool_call' | 'thinking' | 'status' | 'done' | 'error';
  content?: string;
  tool?: string;
  input?: Record<string, unknown>;
  callId?: string;
  usage?: { inputTokens: number; outputTokens: number; cost: string };
}

export class ConvoiaClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async getModels(): Promise<Model[]> {
    const response = await axios.get(`${this.baseUrl}/models`, {
      headers: this.headers,
      timeout: 10000,
    });
    return (response.data?.data || response.data || []).filter((m: any) => m.isActive);
  }

  async getBalance(): Promise<{ balance: number }> {
    const response = await axios.get(`${this.baseUrl}/token-wallet/balance`, {
      headers: this.headers,
      timeout: 10000,
    });
    const data = response.data?.data || response.data;
    return { balance: data.tokenBalance || 0 };
  }

  async *chat(params: {
    modelId: string;
    messages: Array<{ role: string; content: string }>;
    agentId?: string;
    conversationId?: string;
    thinkMode?: boolean;
    webSearchActive?: boolean;
    industry?: string;
  }): AsyncGenerator<StreamEvent> {
    const response = await axios.post(
      `${this.baseUrl}/ai/stream`,
      {
        modelId: params.modelId,
        messages: params.messages,
        agentId: params.agentId,
        conversationId: params.conversationId,
        thinkingEnabled: params.thinkMode,
        webSearchActive: params.webSearchActive,
        industry: params.industry,
        source: 'vscode',
      },
      {
        headers: this.headers,
        timeout: 120000,
        responseType: 'text',
        // Prevent axios from buffering the stream
        transformResponse: [(data: string) => data],
      }
    );

    // Parse SSE response
    const lines = String(response.data).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const parsed = JSON.parse(line.slice(6));

        if (parsed.type === 'chunk') {
          yield { type: 'text', content: parsed.content };
        } else if (parsed.type === 'tool_use') {
          yield { type: 'tool_call', tool: parsed.name, input: parsed.input, callId: parsed.callId };
        } else if (parsed.type === 'thinking_result') {
          yield { type: 'thinking', content: parsed.content };
        } else if (parsed.type === 'status') {
          yield { type: 'status', content: parsed.content };
        } else if (parsed.type === 'done') {
          yield {
            type: 'done',
            usage: {
              inputTokens: parsed.tokens?.input || 0,
              outputTokens: parsed.tokens?.output || 0,
              cost: parsed.cost?.charged || '0',
            },
          };
        } else if (parsed.type === 'error') {
          yield { type: 'error', content: parsed.content };
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }

  async sendToolResult(params: {
    conversationId: string;
    callId: string;
    result: { output: string; success: boolean; error?: string };
  }): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/ai/tool-result`,
      params,
      { headers: this.headers, timeout: 60000 }
    );
    return response.data;
  }
}
