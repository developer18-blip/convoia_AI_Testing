/**
 * Daily digest DRY-RUN.
 *
 * Runs the full org-selection + aggregation + recipient-resolution path and
 * LOGS what WOULD be sent per qualifying org (recipients + content summary),
 * plus the skip list with reasons — WITHOUT sending any email. Read-only.
 *
 * Review this output before flipping DAILY_DIGEST_ENABLED=true on prod.
 *
 *   npm run digest:dry-run          (from backend/)
 *   # or: tsx scripts/daily-digest-dry-run.ts
 */
import { runDailyDigest } from '../src/services/dailyDigestService.js';
import logger from '../src/config/logger.js';

(async () => {
  logger.info('=== DAILY DIGEST DRY-RUN — no emails will be sent ===');
  const result = await runDailyDigest({ dryRun: true });
  logger.info(
    `=== DRY-RUN complete: realTeamsEvaluated=${result.orgsEvaluated} ` +
    `notable=${result.orgsNotable} skipped=${result.skipped.length} ===`,
  );
  process.exit(0);
})().catch((err) => {
  logger.error(`Dry-run failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
