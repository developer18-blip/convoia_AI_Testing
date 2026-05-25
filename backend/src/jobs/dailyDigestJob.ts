import cron from 'node-cron';
import logger from '../config/logger.js';
import { runDailyDigest } from '../services/dailyDigestService.js';

export function startDailyDigestJob(): void {
  // 08:00 UTC daily. No timezone arg → server time (UTC on the prod EC2 host).
  // Per-org-local delivery is a v2 deferral (no timezone column exists yet).
  cron.schedule('0 8 * * *', () => {
    runDigestPass().catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Daily digest cron handler crashed: ${message}`);
    });
  });
  logger.info('Daily digest cron registered (daily at 08:00 UTC)');
}

async function runDigestPass(): Promise<void> {
  if (process.env.DAILY_DIGEST_ENABLED !== 'true') {
    logger.info('Daily digest skipped: DAILY_DIGEST_ENABLED env flag is not "true"');
    return;
  }

  const startTime = Date.now();
  try {
    const result = await runDailyDigest({ dryRun: false });
    logger.info(
      `Daily digest pass done: evaluated=${result.orgsEvaluated} notable=${result.orgsNotable} ` +
      `emailsSent=${result.emailsSent} skipped=${result.skipped.length}, ${Date.now() - startTime}ms`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Daily digest pass crashed: ${message}`);
  }
}
