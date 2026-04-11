/**
 * ConvoiaAI REST API Server
 *
 * Exposes MCP tools, resources, prompts, and chat as HTTP endpoints.
 *
 * Usage:
 *   convoia-mcp --transport api --port 3600
 *   CONVOIA_API_KEY=xxx node dist/index.js --transport api
 *
 * Endpoints:
 *   GET    /api/v1/health              Health check
 *   GET    /api/v1/tools               List all tools
 *   POST   /api/v1/tools/:name         Execute a tool
 *   GET    /api/v1/resources           List resources
 *   GET    /api/v1/resources/*         Read a resource by URI path
 *   GET    /api/v1/prompts             List prompts
 *   POST   /api/v1/prompts/:name       Get a prompt with arguments
 *   POST   /api/v1/chat                Chat (streaming SSE)
 *   POST   /api/v1/chat/sync           Chat (non-streaming JSON)
 *   GET    /api/v1/models              List available models
 *   GET    /api/v1/balance             Token balance
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'http';
import { registerFileTools, handleFileTool } from '../tools/fileTools.js';
import { registerTerminalTools, handleTerminalTool } from '../tools/terminalTools.js';
import { registerGitTools, handleGitTool } from '../tools/gitTools.js';
import { registerSearchTools, handleSearchTool } from '../tools/searchTools.js';
import { registerCodeTools, handleCodeTool } from '../tools/codeTools.js';
import { getProjectStructure, getTechStack } from '../resources/projectContext.js';
import { getOpenFiles } from '../resources/openFiles.js';
import { ConvoiaClient } from '../llm/convoiaClient.js';
import { validateApiKey, getCachedAuth } from '../auth.js';

// ── Types ─────────────────────────────────────────────────────────────

interface APIConfig {
  port: number;
  apiKey: string;
  baseUrl: string;
  workspaceRoot: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// ── Model Resolver (string → UUID) ───────────────────────────────────

interface ModelEntry { id: string; modelId: string; name: string; provider: string }
let modelCache: ModelEntry[] = [];
let modelCacheTime = 0;
const MODEL_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function resolveModelId(input: string, llmClient: ConvoiaClient): Promise<string> {
  // If it's already a UUID, return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    return input;
  }

  // Refresh cache if stale
  if (Date.now() - modelCacheTime > MODEL_CACHE_TTL || modelCache.length === 0) {
    try {
      modelCache = await llmClient.getModels() as ModelEntry[];
      modelCacheTime = Date.now();
    } catch { /* use stale cache */ }
  }

  // Match by modelId string (e.g. "claude-sonnet-4-6")
  const match = modelCache.find(m => m.modelId === input);
  if (match) return match.id;

  // Match by name (e.g. "Claude Sonnet 4.6")
  const nameMatch = modelCache.find(m => m.name.toLowerCase() === input.toLowerCase());
  if (nameMatch) return nameMatch.id;

  // No match — return as-is and let backend handle the error
  return input;
}

// ── Rate Limiter (in-memory) ──────────────────────────────────────────

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 200;
const rateLimitMap = new Map<string, RateLimitEntry>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(key, entry);
  }

  entry.count++;

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

// ── Auth Middleware ───────────────────────────────────────────────────

function createAuthMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for health endpoint
    if (req.path === '/api/v1/health') {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header. Use: Bearer <API_KEY>' });
      return;
    }

    const token = authHeader.slice(7);
    if (token !== apiKey) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }

    next();
  };
}

// ── Tool Router ──────────────────────────────────────────────────────

function getToolList(apiKey: string, baseUrl: string) {
  return [
    ...registerFileTools(),
    ...registerTerminalTools(),
    ...registerGitTools(),
    ...registerSearchTools(apiKey, baseUrl),
    ...registerCodeTools(),
  ];
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  config: APIConfig
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const { apiKey, baseUrl, workspaceRoot } = config;

  // File tools
  if (['read_file', 'write_file', 'edit_file', 'list_directory', 'search_files', 'delete_file'].includes(name)) {
    return handleFileTool(name, args, workspaceRoot);
  }
  // Terminal
  if (name === 'run_command') {
    return handleTerminalTool(name, args, workspaceRoot);
  }
  // Git
  if (name.startsWith('git_')) {
    return handleGitTool(name, args, workspaceRoot);
  }
  // Web search
  if (name === 'web_search') {
    return handleSearchTool(name, args, apiKey, baseUrl);
  }
  // Code tools
  if (name === 'find_symbol' || name === 'get_diagnostics') {
    return handleCodeTool(name, args, workspaceRoot);
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}

// ── Resource Map ─────────────────────────────────────────────────────

const RESOURCES = [
  { uri: 'convoia://project/structure', name: 'Project Structure', description: 'File tree of the workspace', mimeType: 'text/plain' },
  { uri: 'convoia://project/techstack', name: 'Tech Stack', description: 'Detected languages, frameworks, and dependencies', mimeType: 'application/json' },
  { uri: 'convoia://editor/open-files', name: 'Open Files', description: 'Currently open files in the editor', mimeType: 'application/json' },
];

async function readResource(uri: string, workspaceRoot: string): Promise<{ mimeType: string; text: string }> {
  if (uri === 'convoia://project/structure') {
    return { mimeType: 'text/plain', text: await getProjectStructure(workspaceRoot) };
  }
  if (uri === 'convoia://project/techstack') {
    return { mimeType: 'application/json', text: JSON.stringify(await getTechStack(workspaceRoot), null, 2) };
  }
  if (uri === 'convoia://editor/open-files') {
    return { mimeType: 'application/json', text: JSON.stringify(getOpenFiles(), null, 2) };
  }
  throw new Error(`Unknown resource: ${uri}`);
}

// ── Prompt Map ───────────────────────────────────────────────────────

const PROMPTS = [
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
];

function buildPromptMessages(name: string, args: Record<string, string>): Array<{ role: string; content: string }> {
  const lang = args.language || '';
  const code = args.code || '';

  const builders: Record<string, () => Array<{ role: string; content: string }>> = {
    explain_code: () => [{
      role: 'user',
      content: `Explain this ${lang} code in detail. What does it do, how does it work, and are there any potential issues?\n\n\`\`\`${lang}\n${code}\n\`\`\``,
    }],
    refactor_code: () => [{
      role: 'user',
      content: `Refactor this ${lang} code${args.goal ? ` to improve ${args.goal}` : ''}. Show the improved version with explanations.\n\n\`\`\`${lang}\n${code}\n\`\`\``,
    }],
    write_tests: () => [{
      role: 'user',
      content: `Write comprehensive unit tests for this ${lang} code${args.framework ? ` using ${args.framework}` : ''}. Cover edge cases.\n\n\`\`\`${lang}\n${code}\n\`\`\``,
    }],
    review_code: () => [{
      role: 'user',
      content: `Review this ${lang} code. Find bugs, security issues, performance problems, and suggest improvements.\n\n\`\`\`${lang}\n${code}\n\`\`\``,
    }],
    fix_error: () => [{
      role: 'user',
      content: `Fix this error${args.file ? ` in ${args.file}` : ''}:\n\nError: ${args.error}\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nProvide the corrected code and explain the fix.`,
    }],
  };

  const builder = builders[name];
  if (!builder) throw new Error(`Unknown prompt: ${name}`);
  return builder();
}

// ── Create API Server ────────────────────────────────────────────────

export function createAPIServer(config: APIConfig): Promise<http.Server> {
  const app = express();
  const llmClient = new ConvoiaClient(config.apiKey, config.baseUrl);

  // Middleware
  app.use(express.json({ limit: '5mb' }));
  app.use(createAuthMiddleware(config.apiKey));
  app.use(rateLimit);

  // CORS
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // ── Health ───────────────────────────────────────────────────────

  app.get('/api/v1/health', (_req: Request, res: Response) => {
    const auth = getCachedAuth();
    res.json({
      status: 'ok',
      version: '0.1.0',
      transport: 'api',
      workspace: config.workspaceRoot,
      authenticated: auth?.valid || false,
      tokenBalance: auth?.balance || 0,
      uptime: process.uptime(),
    });
  });

  // ── Tools ────────────────────────────────────────────────────────

  app.get('/api/v1/tools', (_req: Request, res: Response) => {
    const tools = getToolList(config.apiKey, config.baseUrl);
    res.json({
      count: tools.length,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  });

  app.post('/api/v1/tools/:name', async (req: Request, res: Response) => {
    const name = String(req.params.name);
    const args = req.body || {};

    // Validate tool exists
    const tools = getToolList(config.apiKey, config.baseUrl);
    const tool = tools.find(t => t.name === name);
    if (!tool) {
      res.status(404).json({ error: `Tool not found: ${name}` });
      return;
    }

    try {
      const result = await executeTool(name, args, config);
      const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');

      res.status(result.isError ? 400 : 200).json({
        tool: name,
        success: !result.isError,
        output: text,
      });
    } catch (err: any) {
      res.status(500).json({ error: `Tool execution failed: ${err.message}` });
    }
  });

  // ── Resources ────────────────────────────────────────────────────

  app.get('/api/v1/resources', (_req: Request, res: Response) => {
    res.json({
      count: RESOURCES.length,
      resources: RESOURCES,
    });
  });

  // Match resource by name: /api/v1/resources/project/structure
  app.get('/api/v1/resources/:category/:name', async (req: Request, res: Response) => {
    const uri = `convoia://${String(req.params.category)}/${String(req.params.name)}`;
    try {
      const result = await readResource(uri, config.workspaceRoot);
      if (result.mimeType === 'application/json') {
        res.type('json').send(result.text);
      } else {
        res.type('text').send(result.text);
      }
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // ── Prompts ──────────────────────────────────────────────────────

  app.get('/api/v1/prompts', (_req: Request, res: Response) => {
    res.json({
      count: PROMPTS.length,
      prompts: PROMPTS,
    });
  });

  app.post('/api/v1/prompts/:name', (req: Request, res: Response) => {
    const name = String(req.params.name);
    const args = req.body || {};

    const prompt = PROMPTS.find(p => p.name === name);
    if (!prompt) {
      res.status(404).json({ error: `Prompt not found: ${name}` });
      return;
    }

    // Validate required arguments
    const missing = prompt.arguments
      .filter(a => a.required && !args[a.name])
      .map(a => a.name);
    if (missing.length > 0) {
      res.status(400).json({ error: `Missing required arguments: ${missing.join(', ')}` });
      return;
    }

    try {
      const messages = buildPromptMessages(name, args);
      res.json({ prompt: name, messages });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Chat (Streaming SSE) ─────────────────────────────────────────

  app.post('/api/v1/chat', async (req: Request, res: Response) => {
    const { modelId, messages, thinkMode, webSearchActive, agentId, conversationId, industry } = req.body;

    if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Required: modelId (string or UUID), messages (array of {role, content})' });
      return;
    }

    // Resolve model string → UUID
    const resolvedModelId = await resolveModelId(modelId, llmClient);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of llmClient.chat({
        modelId: resolvedModelId,
        messages,
        thinkMode,
        webSearchActive,
        agentId,
        conversationId,
        industry,
      })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: err.message })}\n\n`);
    }
    res.end();
  });

  // ── Chat (Non-streaming) ─────────────────────────────────────────

  app.post('/api/v1/chat/sync', async (req: Request, res: Response) => {
    const { modelId, messages, thinkMode, webSearchActive, agentId, conversationId, industry } = req.body;

    if (!modelId || !messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Required: modelId (string or UUID), messages (array of {role, content})' });
      return;
    }

    // Resolve model string → UUID
    const resolvedModelId = await resolveModelId(modelId, llmClient);

    try {
      let fullText = '';
      let thinking = '';
      let usage: { inputTokens: number; outputTokens: number; cost: string } | undefined;

      for await (const event of llmClient.chat({
        modelId: resolvedModelId,
        messages,
        thinkMode,
        webSearchActive,
        agentId,
        conversationId,
        industry,
      })) {
        if (event.type === 'text') fullText += event.content || '';
        else if (event.type === 'thinking') thinking += event.content || '';
        else if (event.type === 'done') usage = event.usage;
      }

      res.json({
        response: fullText,
        ...(thinking ? { thinking } : {}),
        usage,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Models ───────────────────────────────────────────────────────

  app.get('/api/v1/models', async (_req: Request, res: Response) => {
    try {
      const models = await llmClient.getModels();
      res.json({ count: models.length, models });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to fetch models: ${err.message}` });
    }
  });

  // ── Balance ──────────────────────────────────────────────────────

  app.get('/api/v1/balance', async (_req: Request, res: Response) => {
    try {
      const auth = await validateApiKey(config.apiKey, config.baseUrl);
      res.json({ balance: auth.balance, userId: auth.userId });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to fetch balance: ${err.message}` });
    }
  });

  // ── 404 ──────────────────────────────────────────────────────────

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      docs: {
        base: '/api/v1',
        endpoints: [
          'GET  /health',
          'GET  /tools',
          'POST /tools/:name',
          'GET  /resources',
          'GET  /resources/:category/:name',
          'GET  /prompts',
          'POST /prompts/:name',
          'POST /chat',
          'POST /chat/sync',
          'GET  /models',
          'GET  /balance',
        ],
      },
    });
  });

  // ── Start Server ─────────────────────────────────────────────────

  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.error(`[ConvoiaAI API] REST server running on http://localhost:${config.port}`);
      console.error(`[ConvoiaAI API] Base URL: http://localhost:${config.port}/api/v1`);
      console.error(`[ConvoiaAI API] Docs: http://localhost:${config.port}/api/v1/health`);
      resolve(server);
    });
  });
}
