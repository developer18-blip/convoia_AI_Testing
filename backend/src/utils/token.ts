import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { JWTPayload } from '../middleware/authMiddleware.js';

/**
 * Generate short-lived access token. Defaults to config.jwtExpire (15m);
 * pass `expiresIn` to override — used by login to honor "Remember me".
 */
export const generateToken = (payload: JWTPayload, expiresIn?: string): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: (expiresIn || config.jwtExpire) as any,
  });
};

/**
 * Generate long-lived refresh token. Defaults to config.jwtRefreshExpire (7d);
 * pass `expiresIn` to override — used by login to honor "Remember me" so the
 * rolling session can survive multi-week gaps between visits.
 */
export const generateRefreshToken = (payload: JWTPayload, expiresIn?: string): string => {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: (expiresIn || config.jwtRefreshExpire) as any,
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
