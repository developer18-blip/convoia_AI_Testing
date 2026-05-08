import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindow * 60 * 1000,
  max: config.rateLimitMaxRequests,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // behind Nginx proxy
  skip: (req) => req.path === '/health',
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
});

// Auth endpoints - stricter limit to prevent brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many login attempts, please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true,
  skipFailedRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// AI query endpoints - per-user limit for paid features
export const queryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many queries, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => {
    return req.user?.userId || req.ip || 'unknown';
  },
});

// Strict limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many sensitive operations, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// Public visitor chatbot — anonymous, IP-keyed. We eat the token cost as
// marketing CAC, so per-IP caps prevent any one visitor from grinding through
// our budget. Burst cap is the tighter constraint; daily cap is the safety net.
export const chatbotBurstLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  message: {
    success: false,
    statusCode: 429,
    code: 'CHATBOT_RATE_LIMIT',
    message: "You've sent a lot of messages — give it an hour, then try again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `chatbot-burst:${req.ip || 'unknown'}`,
});

export const chatbotDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 50,
  message: {
    success: false,
    statusCode: 429,
    code: 'CHATBOT_DAILY_LIMIT',
    message: "You've reached today's chatbot limit. Try again tomorrow, or sign up to use the real models.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => `chatbot-daily:${req.ip || 'unknown'}`,
});

export default apiLimiter;
