import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { JWTPayload } from '../middleware/authMiddleware.js';

/**
 * Generate short-lived access token (15min default)
 */
export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpire,
  });
};

/**
 * Generate long-lived refresh token (7d default)
 */
export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpire,
  });
};

/**
 * Verify access token
 */
export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, config.jwtSecret) as JWTPayload;
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, config.jwtRefreshSecret) as JWTPayload;
};

/**
 * Decode JWT token without verification (useful for debugging)
 */
export const decodeToken = (token: string): JWTPayload | null => {
  const decoded = jwt.decode(token);
  return decoded as JWTPayload | null;
};

/**
 * Generate cryptographically secure API key
 */
export const generateAPIKey = (): string => {
  return `cvai_${crypto.randomBytes(32).toString('hex')}`;
};

/**
 * Mask API key for display (show only last 4 characters)
 */
export const maskAPIKey = (key: string): string => {
  if (!key || key.length < 8) return '****';
  return `${key.substring(0, 5)}...${key.slice(-4)}`;
};
