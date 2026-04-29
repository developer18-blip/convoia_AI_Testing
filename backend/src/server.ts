import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/env.js';
import logger from './config/logger.js';
import prisma from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import morganMiddleware from './middleware/loggingMiddleware.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { optionalAuth } from './middleware/authMiddleware.js';
import { sanitizeObject } from './utils/security.js';

// Routes
import authRoutes from './routes/authRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import usageRoutes from './routes/usageRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import stripeRoutes from './routes/stripeRoutes.js';
import openWebUIRoutes from './routes/openWebUIRoutes.js';
import modelRoutes from './routes/modelRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import tokenRoutes from './routes/tokenRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import tokenWalletRoutes from './routes/tokenWalletRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import userFactRoutes from './routes/userFactRoutes.js';
import audioRoutes from './routes/audioRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import agentToolRoutes from './routes/agentToolRoutes.js';
import { startLocalCleanup as startFileGenCleanup } from './services/fileGenerationService.js';

const app: Express = express();

// Trust proxy (required when behind Nginx/load balancer for rate limiter + real IP)
app.set('trust proxy', 1);

// ============== STRIPE WEBHOOK (must be before express.json()) ==============
// Only the webhook needs raw body — mount on exact path, not a sub-router,
// so it doesn't intercept OPTIONS preflight for other /api/stripe/* routes.
import expressModule from 'express';
import { handleStripeWebhook } from './controllers/stripeWebhookController.js';
app.post('/api/stripe/webhook', expressModule.raw({ type: 'application/json' }), handleStripeWebhook);

// ============== SECURITY HEADERS ==============
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ============== CORS ==============
const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  // New primary domain
  'https://convoia.ai',
  'https://www.convoia.ai',
  // Legacy domain — keep during 30-day migration window, remove once
  // everyone's bookmarks / cached sessions have drained.
  'https://intellect.convoia.com',
  // Capacitor native app origins — Android uses https://localhost, iOS uses capacitor://localhost
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  // Development-only origins
  ...(isDev ? [
    'http://localhost',
    'http://localhost:5173',
    'http://localhost:5175',
    'http://localhost:8080',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:8080',
  ] : []),
].filter(Boolean);

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Always allowed: configured origins, convoia.com subdomains, Capacitor/Ionic native.
      // Ngrok tunnels only in dev (used for mobile testing against a local backend).
      const allowed =
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.convoia.ai') ||
        origin.endsWith('.convoia.com') ||
        origin.startsWith('capacitor://') ||
        origin.startsWith('ionic://') ||
        (isDev && (origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io') || origin.endsWith('.ngrok-free.app')));
      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  })
);

logger.info(`CORS: env=${isDev ? 'dev' : 'prod'} allowedOrigins=[${allowedOrigins.join(', ')}]`); 

// ============== COMPRESSION ==============
// Skip compression for SSE streaming endpoints (compression buffers chunks)
app.use(compression({
  filter: (req, res) => {
    if (req.path.includes('/query/stream')) return false;
    return compression.filter(req, res);
  },
}));

// ============== LOGGING ==============
app.use(morganMiddleware);

// ============== PARSING ==============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ============== STATIC FILES (generated images) ==============
import path from 'path';
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '30d',
  immutable: true,
}));

// ============== INPUT SANITIZATION ==============
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
});

// ============== RATE LIMITING ==============
app.use(apiLimiter);

// ============== OPTIONAL AUTH ==============
app.use(optionalAuth);

// ============== SECURITY HEADERS ==============
app.use((req: Request, res: Response, next: NextFunction) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Disable caching for sensitive endpoints
  if (req.path.includes('/api/auth') || req.path.includes('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
});

// ============== HEALTH CHECK ==============
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    statusCode: 200,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

// ============== API ROOT ENDPOINTS ==============
const apiInfo = {
  success: true,
  statusCode: 200,
  message: 'ConvoiaAI Backend API Root',
  endpoints: {
    auth: '/api/auth',
    ai: '/api/ai',
    usage: '/api/usage',
    admin: '/api/admin',
    budget: '/api/budget',
    session: '/api/session',
    keys: '/api/keys',
    stripe: '/api/stripe',
    openwebui: '/api/ai/openwebui',
    tokens: '/api/tokens',
    tasks: '/api/tasks',
    notifications: '/api/notifications',
    agents: '/api/agents',
    team: '/api/team',
  },
  timestamp: new Date().toISOString(),
};
app.get('/api', (req: Request, res: Response) => {
  res.json(apiInfo);
});
app.get('/api/', (req: Request, res: Response) => {
  res.json(apiInfo);
});
// ============== ROOT ENDPOINT ==============
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    statusCode: 200,
    message: 'ConvoiaAI Backend API v1.0.0',
    version: '1.0.0',
    environment: config.nodeEnv,
    endpoints: {
      auth: '/api/auth',
      ai: '/api/ai',
      usage: '/api/usage',
      admin: '/api/admin',
      budget: '/api/budget',
      session: '/api/session',
      keys: '/api/keys',
      stripe: '/api/stripe',
      tokens: '/api/tokens',
      tasks: '/api/tasks',
      notifications: '/api/notifications',
      agents: '/api/agents',
      team: '/api/team',
    },
    timestamp: new Date().toISOString(),
  });
});

// ============== API ROUTES ==============
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/keys', apiKeyRoutes);
app.use('/api/ai/openwebui', openWebUIRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/token-wallet', tokenWalletRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/user/facts', userFactRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/agent-tools', agentToolRoutes);

// ============== 404 HANDLER ==============
app.use('*', (req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
});

// ============== ERROR HANDLER ==============
app.use(errorHandler);


// ============== MODEL HEALTH CHECK ==============
// Runs on startup: deactivates models whose provider has no API key,
// and deprecated models that will 404. Re-activates if key is added later.
async function validateModels() {
  try {
    const providerKeys: Record<string, boolean> = {
      openai: !!config.apiKeys.openai,
      anthropic: !!config.apiKeys.anthropic,
      google: !!config.apiKeys.google,
      deepseek: !!config.apiKeys.deepseek,
      mistral: !!config.apiKeys.mistral,
      perplexity: !!config.apiKeys.perplexity,
      xai: !!config.apiKeys.xai,
      groq: !!config.apiKeys.groq,
    };

    // Deprecated model IDs that providers have shut down
    const DEPRECATED_MODELS = [
      'gemini-3-pro-preview',       // Deprecated by Google March 9, 2026
      'gemini-3-pro-image-preview', // Deprecated with Gemini 3 Pro
      'sonar-reasoning',            // Deprecated by Perplexity April 2026
      'grok-2-1212',                // Deprecated by xAI — replaced by Grok 4
      'grok-2-vision-1212',         // Deprecated by xAI — replaced by Grok 4
    ];

    // 1. Deactivate models without API keys
    const providersWithoutKeys = Object.entries(providerKeys)
      .filter(([, hasKey]) => !hasKey)
      .map(([provider]) => provider);

    if (providersWithoutKeys.length > 0) {
      const result = await prisma.aIModel.updateMany({
        where: { provider: { in: providersWithoutKeys }, isActive: true },
        data: { isActive: false },
      });
      if (result.count > 0) {
        logger.warn(`Model validation: deactivated ${result.count} model(s) — no API keys for: ${providersWithoutKeys.join(', ')}`);
      }
    }

    // 2. Re-activate models for providers that DO have keys (in case key was added)
    const providersWithKeys = Object.entries(providerKeys)
      .filter(([, hasKey]) => hasKey)
      .map(([provider]) => provider);

    if (providersWithKeys.length > 0) {
      const reactivated = await prisma.aIModel.updateMany({
        where: {
          provider: { in: providersWithKeys },
          isActive: false,
          modelId: { notIn: DEPRECATED_MODELS },
        },
        data: { isActive: true },
      });
      if (reactivated.count > 0) {
        logger.info(`Model validation: re-activated ${reactivated.count} model(s) for providers with keys`);
      }
    }

    // 3. Deactivate deprecated models regardless of API key
    const deprecated = await prisma.aIModel.updateMany({
      where: { modelId: { in: DEPRECATED_MODELS }, isActive: true },
      data: { isActive: false },
    });
    if (deprecated.count > 0) {
      logger.warn(`Model validation: deactivated ${deprecated.count} deprecated model(s): ${DEPRECATED_MODELS.join(', ')}`);
    }

    // Summary
    const activeCount = await prisma.aIModel.count({ where: { isActive: true } });
    const totalCount = await prisma.aIModel.count();
    logger.info(`Model validation complete: ${activeCount}/${totalCount} models active`);
  } catch (err: any) {
    logger.error(`Model validation failed (non-fatal): ${err.message}`);
  }
}

// ============== API KEY ONE-SHOT HASHING MIGRATION ==============
// Runs once on boot. Any API key row whose `key` column still holds a
// plaintext value (our raw keys start with "cvai_") is re-hashed with
// SHA-256 and the keyPrefix column is populated so the list UI still
// shows a recognizable prefix. Idempotent: re-running does nothing once
// all keys are hashed. Runs before app.listen() so there is zero
// window where the new code runs against an unmigrated DB.
async function migrateApiKeysToHashed(): Promise<void> {
  try {
    const { hashApiKey, apiKeyPrefix } = await import('./middleware/apiKeyAuth.js');
    const plaintextKeys = await prisma.aPIKey.findMany({
      where: { key: { startsWith: 'cvai_' } },
      select: { id: true, key: true },
    });
    if (plaintextKeys.length === 0) {
      logger.info('API key hashing migration: no plaintext keys found — skipping');
      return;
    }
    logger.warn(`API key hashing migration: re-hashing ${plaintextKeys.length} plaintext key(s)`);
    for (const k of plaintextKeys) {
      await prisma.aPIKey.update({
        where: { id: k.id },
        data: {
          key: hashApiKey(k.key),
          keyPrefix: apiKeyPrefix(k.key),
        },
      });
    }
    logger.info(`API key hashing migration: re-hashed ${plaintextKeys.length} key(s) successfully`);
  } catch (err: any) {
    // Non-fatal: if migration fails, keys stay plaintext and the new
    // middleware will reject them. Surface it loudly so we notice.
    logger.error(`API key hashing migration FAILED: ${err.message}`);
  }
}

import { hydrateModelProfiles } from './ai/modelProfiles.js';

// ============== START SERVER ==============
const startServer = async (): Promise<void> => {
  try {
    await validateModels();
    await migrateApiKeysToHashed();
    await hydrateModelProfiles(prisma); // maps LLM Router profiles to active DB model IDs
    startFileGenCleanup(); // no-op unless USE_LOCAL_FILE_STORAGE=true

    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server is running on port ${config.port}`);
      logger.info(`📝 Environment: ${config.nodeEnv}`);
      logger.info(`🔗 API Base URL: http://localhost:${config.port}/api`);
      logger.info(`✅ Security: SSL/TLS Headers Enabled`);
      logger.info(`✅ Rate Limiting: Enabled`);
      logger.info(`✅ Input Sanitization: Enabled`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed gracefully');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed gracefully');
        process.exit(0);
      });
    });

    // Handle unhandled promise rejections — DO NOT crash the server
    // Stream errors from axios sometimes escape catch blocks as rejections.
    // Logging and continuing is safer than killing the process.
    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason?.message || String(reason),
        stack: reason?.stack?.slice(0, 500),
      });
      // Do NOT process.exit — PM2 restart loop is worse than a logged warning
    });

    // Handle uncaught exceptions — log and graceful shutdown
    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught Exception', {
        message: err.message,
        stack: err.stack?.slice(0, 500),
      });
      // Give logger time to flush, then exit (PM2 will restart once)
      setTimeout(() => process.exit(1), 1000);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
