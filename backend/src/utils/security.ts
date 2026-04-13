/**
 * Security Utilities for XSS, SQL Injection, and input sanitization
 */

import nodeCrypto from 'crypto';

const htmlSpecialChars: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

/**
 * Escape HTML to prevent XSS attacks
 */
export const escapeHtml = (text: string): string => {
  if (!text) return text;
  return String(text).replace(/[&<>"']/g, (char) => htmlSpecialChars[char] || char);
};

/**
 * Remove potentially dangerous HTML tags
 */
export const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return input;

  // Remove script tags and content
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(
    /on\w+\s*=\s*["']?(?:javascript:)?[^"']*["']?/gi,
    ''
  );

  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed|frame|frameset)[^>]*>/gi, '');

  return sanitized;
};

/**
 * Validate and sanitize email
 */
export const sanitizeEmail = (email: string): string => {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
};

/**
 * Check for SQL injection patterns
 */
export const detectSQLInjection = (input: string): boolean => {
  if (!input || typeof input !== 'string') return false;

  const sqlKeywords = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|WHERE)\b)/i,
    /(-{2}|\/\*|\*\/|;|xp_|sp_)/,
    /(or|and)\s+('|")?\d+('|")?\s*=\s*('|")?\d+/i,
  ];

  return sqlKeywords.some((pattern) => pattern.test(input));
};

/**
 * Sanitize object properties recursively
 */
export const sanitizeObject = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = sanitizeInput(key);

      // Recursively sanitize value
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = sanitizeInput(value);
      } else if (!Array.isArray(value) && typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = sanitizeObject(value);
      } else {
        sanitized[sanitizedKey] = value;
      }
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }

  return obj;
};

/**
 * Validate password strength
 */
export const validatePasswordStrength = (password: string): {
  isStrong: boolean;
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters');

  if (password.length >= 12) score += 1;

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Add numbers');

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
  else feedback.push('Add special characters');

  return {
    isStrong: score >= 5,
    score,
    feedback,
  };
};

/**
 * Generate secure random token
 */
export const generateSecureToken = (length: number = 32): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // Node's crypto.randomBytes is always available and is CSPRNG; no Math.random fallback.
  const arr = nodeCrypto.randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[arr[i] % chars.length];
  }
  return token;
};

/**
 * Hash sensitive data for logging (e.g., API keys)
 */
export const hashForLogging = (value: string): string => {
  if (!value || value.length < 4) return '***';
  return `${value.substring(0, 2)}...${value.substring(value.length - 2)}`;
};

/**
 * Validate API key format
 */
export const isValidAPIKeyFormat = (key: string): boolean => {
  // API keys should be alphanumeric, at least 32 characters
  return /^[a-zA-Z0-9_-]{32,}$/.test(key);
};

/**
 * Check for CORS origin validity
 */
export const isValidOrigin = (origin: string, allowedOrigins: string[]): boolean => {
  return allowedOrigins.some((allowed) => {
    if (allowed === '*') return true;

    // Exact match
    if (allowed === origin) return true;

    // Pattern matching with wildcards
    const pattern = allowed
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(origin);
  });
};

export default {
  escapeHtml,
  sanitizeInput,
  sanitizeEmail,
  detectSQLInjection,
  sanitizeObject,
  validatePasswordStrength,
  generateSecureToken,
  hashForLogging,
  isValidAPIKeyFormat,
  isValidOrigin,
};
