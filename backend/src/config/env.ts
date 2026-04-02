import dotenv from 'dotenv';

dotenv.config();

// Fail hard on missing critical secrets in production
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET must be set in production');
}
if (isProduction && !process.env.JWT_REFRESH_SECRET) {
  throw new Error('FATAL: JWT_REFRESH_SECRET must be set in production');
}
if (isProduction && !process.env.DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL must be set in production');
}
if (isProduction && !process.env.STRIPE_SECRET_KEY) {
  throw new Error('FATAL: STRIPE_SECRET_KEY must be set in production');
}
if (isProduction && !process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error('FATAL: STRIPE_WEBHOOK_SECRET must be set in production');
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction,

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
  jwtExpire: process.env.JWT_EXPIRE || '15m',
  jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || '7d',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // API Keys — all providers including Groq
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    groq: process.env.GROQ_API_KEY,
  },

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  // Token-only billing — no subscription plans

  // Resend (transactional emails)
  resendApiKey: process.env.RESEND_API_KEY,

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Logging
  logLevel: process.env.NODE_LOG_LEVEL || 'info',
  logFilePath: process.env.LOG_FILE_PATH || './logs/app.log',

  // Rate Limiting
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '5000', 10),

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // Open WebUI
  openWebUIUrl: process.env.OPEN_WEBUI_URL || 'http://localhost:3001',

  // AI Gateway
  aiRequestTimeout: parseInt(process.env.AI_REQUEST_TIMEOUT || '120000', 10),
};

export default config;
