import { Router, Request, Response } from 'express';
import prismaClient from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const prisma = prismaClient as any;

const router = Router();
router.use(authMiddleware);

interface RecentQueryRow {
  content: string;
  createdAt: Date;
  model: string | null;
  provider: string | null;
}
interface CacheEntry {
  queries: RecentQueryRow[];
  fetchedAt: number;
}

// 30s per-user TTL cache. Each entry stores up to CACHE_FETCH_SIZE most
// recent unique queries; the response slices to the requested limit so
// smaller queries are served from the same cache without a second DB hit.
// Pure TTL — no explicit invalidation. A user who just sent a query has
// it in their input box; 30s lag in the dropdown is acceptable.
const recentQueriesCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;
const CACHE_FETCH_SIZE = 20;

router.get('/me/recent-queries', asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, CACHE_FETCH_SIZE);
  const userId = req.user!.userId;

  const now = Date.now();
  const cached = recentQueriesCache.get(userId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    res.json({
      success: true,
      data: cached.queries.slice(0, limit),
      cached: true,
    });
    return;
  }

  // DISTINCT ON (content) keeps the most recent row per unique query content
  // (Postgres-specific; aligns with existing $queryRaw usage in
  // adminController.ts). Re-sorted by recency in the outer SELECT so the
  // response order matches "most recent first" rather than alphabetical.
  // Prisma's native distinct + orderBy + take has version-dependent
  // semantics around how it composes with LIMIT — raw SQL is unambiguous.
  const queries = await prisma.$queryRaw<RecentQueryRow[]>`
    SELECT content, "createdAt", model, provider FROM (
      SELECT DISTINCT ON (cm.content)
        cm.content, cm."createdAt", cm.model, cm.provider
      FROM "ChatMessage" cm
      INNER JOIN "Conversation" c ON cm."conversationId" = c.id
      WHERE c."userId" = ${userId}
        AND cm.role = 'user'
      ORDER BY cm.content, cm."createdAt" DESC
    ) AS deduped
    ORDER BY "createdAt" DESC
    LIMIT ${CACHE_FETCH_SIZE}
  `;

  recentQueriesCache.set(userId, { queries, fetchedAt: now });

  res.json({
    success: true,
    data: queries.slice(0, limit),
    cached: false,
  });
}));

export default router;
