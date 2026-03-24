import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/env.js';
import logger from './config/logger.js';
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
import walletRoutes from './routes/walletRoutes.js';
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
  // Development origins — excluded in production
  ...(isDev ? [
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
      // Allow all ngrok domains + configured origins
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok.io')) {
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
    wallet: '/api/wallet',
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
      wallet: '/api/wallet',
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
app.use('/api/wallet', walletRoutes);
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


// ============== START SERVER ==============
const startServer = async (): Promise<void> => {
  try {
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

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
