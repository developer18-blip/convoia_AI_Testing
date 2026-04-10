/**
 * SSE Transport — for remote mode.
 * HTTP server with SSE endpoint for JSON-RPC communication.
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';

let transport: SSEServerTransport | null = null;

export function createSSEServer(port: number, apiKey: string): Promise<{ transport: SSEServerTransport; server: http.Server }> {
  return new Promise((resolve) => {
    const httpServer = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Auth check
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      if (req.url === '/sse' && req.method === 'GET') {
        // SSE connection endpoint
        transport = new SSEServerTransport('/message', res);
        resolve({ transport, server: httpServer });
      } else if (req.url === '/message' && req.method === 'POST') {
        // JSON-RPC message endpoint
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No SSE connection established' }));
        }
      } else if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', transport: 'sse' }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    httpServer.listen(port, () => {
      console.error(`[ConvoiaAI MCP] SSE server listening on port ${port}`);
      console.error(`[ConvoiaAI MCP] Connect: GET http://localhost:${port}/sse`);
    });
  });
}
