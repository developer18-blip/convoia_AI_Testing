/**
 * Search Tools — web search via ConvoiaAI Perplexity integration.
 */

import axios from 'axios';

export function registerSearchTools(_apiKey: string, _baseUrl: string) {
  return [
    {
      name: 'web_search',
      description: 'Search the web for documentation, Stack Overflow answers, API references, or current information. Billed as normal ConvoiaAI token usage.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (be specific, e.g., "Express.js middleware error handling best practices")' },
        },
        required: ['query'],
      },
    },
  ];
}

export async function handleSearchTool(
  _name: string, args: Record<string, unknown>, apiKey: string, baseUrl: string
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const query = String(args.query);

  try {
    const response = await axios.post(
      `${baseUrl}/ai/stream`,
      {
        modelId: '', // backend resolves to Perplexity Sonar
        messages: [{ role: 'user', content: query }],
        webSearchActive: true,
        source: 'vscode',
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000,
        responseType: 'text',
      }
    );

    // Parse SSE response
    const lines = String(response.data).split('\n');
    let result = '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'chunk') result += parsed.content;
      } catch { /* skip */ }
    }

    return { content: [{ type: 'text', text: result || 'No results found.' }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Search failed: ${err.message}` }], isError: true };
  }
}
