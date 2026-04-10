/**
 * StdIO Transport — default for VS Code integration.
 * VS Code spawns the MCP server as a child process and communicates via stdin/stdout.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createStdioTransport(): StdioServerTransport {
  return new StdioServerTransport();
}
