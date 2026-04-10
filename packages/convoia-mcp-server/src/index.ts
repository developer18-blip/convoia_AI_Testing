#!/usr/bin/env node

/**
 * ConvoiaAI MCP Server — Entry Point
 *
 * Usage:
 *   convoia-mcp --transport stdio              (default, for VS Code)
 *   convoia-mcp --transport sse --port 3500    (remote mode)
 *   CONVOIA_API_KEY=xxx convoia-mcp            (env-based config)
 */

import dotenv from 'dotenv';
dotenv.config();

import { ConvoiaMCPServer } from './server.js';
import { createStdioTransport } from './transport/stdio.js';
import { createSSEServer } from './transport/sse.js';
import { validateApiKey } from './auth.js';

// ── Parse CLI args ───────────────────────────────────────────────────

function parseArgs(): { transport: 'stdio' | 'sse'; port: number; apiKey: string; baseUrl: string; workspaceRoot: string } {
  const args = process.argv.slice(2);
  let transport: 'stdio' | 'sse' = 'stdio';
  let port = 3500;
  let apiKey = process.env.CONVOIA_API_KEY || '';
  let baseUrl = process.env.CONVOIA_API_URL || 'https://intellect.convoia.com/api';
  let workspaceRoot = process.env.CONVOIA_WORKSPACE || process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--transport' && args[i + 1]) {
      transport = args[++i] as 'stdio' | 'sse';
    } else if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i], 10);
    } else if (args[i] === '--api-key' && args[i + 1]) {
      apiKey = args[++i];
    } else if (args[i] === '--base-url' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === '--workspace' && args[i + 1]) {
      workspaceRoot = args[++i];
    }
  }

  return { transport, port, apiKey, baseUrl, workspaceRoot };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();

  if (!config.apiKey) {
    console.error('[ConvoiaAI MCP] ERROR: No API key provided.');
    console.error('  Set CONVOIA_API_KEY env var or pass --api-key <key>');
    console.error('  Get your key at: https://intellect.convoia.com/api-keys');
    process.exit(1);
  }

  // Validate API key
  console.error('[ConvoiaAI MCP] Validating API key...');
  const auth = await validateApiKey(config.apiKey, config.baseUrl);
  if (!auth.valid) {
    console.error(`[ConvoiaAI MCP] API key validation failed: ${auth.error}`);
    process.exit(1);
  }
  console.error(`[ConvoiaAI MCP] Authenticated. Token balance: ${auth.balance.toLocaleString()}`);

  // Create MCP server
  const mcpServer = new ConvoiaMCPServer(config.apiKey, config.baseUrl, config.workspaceRoot);

  // Start with selected transport
  if (config.transport === 'sse') {
    const { transport } = await createSSEServer(config.port, config.apiKey);
    await mcpServer.getServer().connect(transport);
    console.error(`[ConvoiaAI MCP] Server running (SSE mode, port ${config.port})`);
  } else {
    const transport = createStdioTransport();
    await mcpServer.getServer().connect(transport);
    console.error('[ConvoiaAI MCP] Server running (stdio mode)');
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.error('[ConvoiaAI MCP] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[ConvoiaAI MCP] Shutting down...');
  process.exit(0);
});

main().catch((err) => {
  console.error('[ConvoiaAI MCP] Fatal error:', err.message);
  process.exit(1);
});
