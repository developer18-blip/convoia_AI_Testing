import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { getOrgTokenBalance } from './orgBalanceService.js';
import { EmailService } from './emailService.js';
import { NotificationService } from './notificationService.js';

export interface DigestTopUser {
  name: string;
  tokens: number;
}

export interface OrgDigest {
  organizationId: string;
  orgName: string;
  newMembers: string[];
  newMemberCount: number;
  totalTokens: number;
  spend: number;
  topUsers: DigestTopUser[];
  activeUsers: number;
  walletBalance: number;
}

export interface DigestRunResult {
  orgsEvaluated: number;
  orgsNotable: number;
  emailsSent: number;
  skipped: { org: string; reason: string }[];
}

/**
 * Yesterday as a half-open UTC range: [start of yesterday, start of today).
 * v1 fires at a fixed 08:00 UTC; per-org-local delivery is a v2 deferral (no
 * timezone column exists on Organization/User).
 */
export function yesterdayRangeUTC(now: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Build a digest for one org, or return null if the day wasn't notable.
 * Notable = (new members yesterday > 0) OR (yesterday's total tokens > 0).
 */
async function buildOrgDigest(
  org: { id: string; name: string },
  range: { start: Date; end: Date },
): Promise<OrgDigest | null> {
  const { start, end } = range;

  // (a) New members yesterday — source of truth is ActivityLog member_joined
  // (the joiner is the actor). Captures every qualifying-team join path.
  const joins = await prisma.activityLog.findMany({
    where: { organizationId: org.id, action: 'member_joined', createdAt: { gte: start, lt: end } },
    include: { actor: { select: { name: true } } },
  });
  const newMembers = joins.map(j => j.actor?.name ?? 'A new member');

  // (b) Total tokens + spend yesterday (orgId is on every UsageLog row directly)
  const usageAgg = await prisma.usageLog.aggregate({
    where: { organizationId: org.id, createdAt: { gte: start, lt: end } },
    _sum: { totalTokens: true, customerPrice: true },
  });
  const totalTokens = usageAgg._sum.totalTokens ?? 0;
  const spend = usageAgg._sum.customerPrice ?? 0;

  // Threshold: skip entirely if nothing notable happened.
  if (newMembers.length === 0 && totalTokens === 0) return null;

  // (c) Top 3 users by usage yesterday
  const top = await prisma.usageLog.groupBy({
    by: ['userId'],
    where: { organizationId: org.id, createdAt: { gte: start, lt: end } },
    _sum: { totalTokens: true },
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: 3,
  });
  const topIds = top.map(t => t.userId);
  const topNames = topIds.length
    ? await prisma.user.findMany({ where: { id: { in: topIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(topNames.map(u => [u.id, u.name]));
  const topUsers: DigestTopUser[] = top.map(t => ({
    name: nameById.get(t.userId) ?? 'Unknown user',
    tokens: t._sum.totalTokens ?? 0,
  }));

  // (d) Active users yesterday = distinct users with >= 1 billed request
  const activeRows = await prisma.usageLog.findMany({
    where: { organizationId: org.id, createdAt: { gte: start, lt: end } },
    distinct: ['userId'],
    select: { userId: true },
  });

  // (e) Current wallet balance (authoritative owner-wallet/pool logic)
  const balance = await getOrgTokenBalance(org.id);

  return {
    organizationId: org.id,
    orgName: org.name,
    newMembers,
    newMemberCount: newMembers.length,
    totalTokens,
    spend,
    topUsers,
    activeUsers: activeRows.length,
    walletBalance: balance.availableTokens,
  };
}

/**
 * Recipients for an org digest: owner + managers, deduped, filtered to those
 * whose emailDigest preference is on (default true via the opt-out model).
 */
async function getDigestRecipients(orgId: string): Promise<{ id: string; email: string; name: string }[]> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { ownerId: true } });

  const privileged = await prisma.user.findMany({
    where: { organizationId: orgId, role: { in: ['org_owner', 'manager'] } },
    select: { id: true, email: true, name: true },
  });
  const byId = new Map(privileged.map(u => [u.id, u]));

  if (org?.ownerId && !byId.has(org.ownerId)) {
    const owner = await prisma.user.findUnique({
      where: { id: org.ownerId },
      select: { id: true, email: true, name: true },
    });
    if (owner) byId.set(owner.id, owner);
  }

  const recipients: { id: string; email: string; name: string }[] = [];
  for (const u of byId.values()) {
    const prefs = await NotificationService.getPreferences(u.id);
    if (prefs.emailDigest) recipients.push(u);
  }
  return recipients;
}

/**
 * Run the daily digest over all qualifying orgs.
 *
 * Org selection (real teams only): name != 'Personal' AND member count > 1 —
 * this is what stops the ~54 solo "Personal" orgs from each getting a digest.
 *
 * dryRun=true logs what WOULD be sent per notable org (recipients + content
 * summary) AND the skip list with reasons, and sends NOTHING.
 */
export async function runDailyDigest(opts: { dryRun: boolean }): Promise<DigestRunResult> {
  const range = yesterdayRangeUTC();

  const orgs = await prisma.organization.findMany({
    where: { name: { not: 'Personal' } },
    select: { id: true, name: true, _count: { select: { users: true } } },
  });
  const realTeams = orgs.filter(o => o._count.users > 1);

  let orgsNotable = 0;
  let emailsSent = 0;
  const skipped: { org: string; reason: string }[] = [];

  for (const org of realTeams) {
    const digest = await buildOrgDigest({ id: org.id, name: org.name }, range);
    if (!digest) {
      skipped.push({ org: org.name, reason: 'not notable (0 new members AND 0 tokens yesterday)' });
      continue;
    }
    orgsNotable++;

    const recipients = await getDigestRecipients(org.id);
    if (recipients.length === 0) {
      skipped.push({ org: org.name, reason: 'notable but no opted-in owner/admin recipients' });
      continue;
    }

    if (opts.dryRun) {
      logger.info(
        `[DIGEST DRY-RUN] WOULD SEND org="${digest.orgName}" ` +
        `to=[${recipients.map(r => r.email).join(', ')}] | ` +
        `newMembers=${digest.newMemberCount}${digest.newMemberCount ? ` (${digest.newMembers.join(', ')})` : ''} | ` +
        `tokens=${digest.totalTokens.toLocaleString('en-US')} | spend=$${digest.spend.toFixed(2)} | ` +
        `top=[${digest.topUsers.map(u => `${u.name}:${u.tokens}`).join(', ') || '—'}] | ` +
        `active=${digest.activeUsers} | wallet=${digest.walletBalance.toLocaleString('en-US')}`,
      );
    } else {
      for (const r of recipients) {
        await EmailService.sendDailyDigest({ recipientEmail: r.email, recipientName: r.name, digest })
          .then(() => { emailsSent++; })
          .catch(err => {
            logger.error(`Digest email failed to ${r.email}: ${err instanceof Error ? err.message : String(err)}`);
          });
      }
    }
  }

  if (opts.dryRun) {
    for (const s of skipped) logger.info(`[DIGEST DRY-RUN] SKIP org="${s.org}" — ${s.reason}`);
    logger.info(
      `[DIGEST DRY-RUN] summary: realTeamsEvaluated=${realTeams.length} ` +
      `notable=${orgsNotable} skipped=${skipped.length} (no emails sent)`,
    );
  }

  return { orgsEvaluated: realTeams.length, orgsNotable, emailsSent, skipped };
}
