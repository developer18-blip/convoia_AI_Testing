import { Request, Response } from 'express';
import * as fs from 'fs';
import logger from '../config/logger.js';
import { verifyPlotToken, plotStoragePath } from '../services/sandboxService.js';

/**
 * GET /api/sandbox/plot/:plotId?token=<signed>
 *
 * Token-gated PNG delivery. Auth lives in the query param so the LLM-
 * emitted markdown `![](/api/sandbox/plot/<id>?token=<t>)` works in the
 * existing chat <img> renderer (which can't send Authorization headers).
 *
 * Security model — must satisfy ALL three checks:
 *   1. Token verifies (HMAC + unexpired)
 *   2. Token's plotId matches URL :plotId (prevents token-swap attacks
 *      where token for plot A is used to fetch plot B; mirrors the
 *      cross-check in fileRoutes.ts download flow)
 *   3. Disk file exists at uploads/sandbox-plots/<userId>/<plotId>.png
 *
 * If ALL three pass: stream the PNG bytes back with the right MIME type.
 * Otherwise: 401 / 403 / 404 with a tight body — no info leakage.
 */
export const servePlot = (req: Request, res: Response): void => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(401).json({ error: 'Missing plot token' });
    return;
  }

  const payload = verifyPlotToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired plot token' });
    return;
  }

  if (payload.plotId !== req.params.plotId) {
    res.status(403).json({ error: 'Plot token does not match requested plot' });
    return;
  }

  const filePath = plotStoragePath(payload.userId, payload.plotId);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Plot expired or no longer available' });
    return;
  }

  res.setHeader('Content-Type', 'image/png');
  // 7-day cache — same as the token's lifetime. Plots are immutable
  // (the plotId UUID is unique per execution), so it's safe.
  res.setHeader('Cache-Control', 'private, max-age=604800, immutable');
  fs.createReadStream(filePath).on('error', (err) => {
    logger.warn(`Plot stream error for ${filePath}: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'Plot read failed' });
  }).pipe(res);
};
