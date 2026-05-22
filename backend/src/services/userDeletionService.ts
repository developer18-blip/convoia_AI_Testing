import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Permanently delete a user and every record linked to them.
 *
 * Mirrors the proven cascade in teamController.removeMember's permanent-delete
 * path, with one addition: TokenRefillRule.createdById is `onDelete: Restrict`
 * in the schema, so a refill rule the user *created* would block the final
 * `user.delete()`. We remove those first.
 *
 * Tables with `onDelete: Cascade` on their user relation (Conversation,
 * ChatMessage, ConversationAttachment, Folder, UserFact,
 * UserConversationSummary, ToolExecution, AgentMemory, AgentProject, …) are
 * removed automatically by the final delete; the explicit deletes below are
 * belt-and-suspenders for the references that are NOT cascade.
 *
 * NOTE: callers must block users who OWN an organization before calling this —
 * Organization.owner is `onDelete: Restrict` and will throw otherwise.
 */
export async function purgeUserAndData(userId: string): Promise<void> {
  const p = prisma as any;

  // Token allocations granted to or by this user.
  await p.tokenAllocation?.deleteMany({
    where: { OR: [{ assignedToId: userId }, { assignedById: userId }] },
  }).catch(() => {});

  // Refill rules: subject (userId) cascades, but createdById is Restrict and
  // would block the user delete — clear both.
  await p.tokenRefillRule?.deleteMany({
    where: { OR: [{ userId }, { createdById: userId }] },
  }).catch(() => {});

  // All other foreign-key references (mirrors the admin permanent-delete path).
  const cleanups = [
    p.task?.deleteMany({ where: { OR: [{ assignedToId: userId }, { createdById: userId }] } }),
    p.subTask?.deleteMany({ where: { task: { OR: [{ assignedToId: userId }, { createdById: userId }] } } }),
    p.taskComment?.deleteMany({ where: { userId } }),
    p.notification?.deleteMany({ where: { userId } }),
    p.tokenTransaction?.deleteMany({ where: { userId } }),
    p.chatMessage?.deleteMany({ where: { conversation: { userId } } }),
    p.conversation?.deleteMany({ where: { userId } }),
    p.userMemory?.deleteMany({ where: { userId } }),
    p.hourlySession?.deleteMany({ where: { userId } }),
    p.aPIKey?.deleteMany({ where: { userId } }),
    p.orgInvite?.deleteMany({ where: { OR: [{ invitedById: userId }, { acceptedById: userId }] } }),
    p.activityLog?.deleteMany({ where: { OR: [{ actorId: userId }, { targetId: userId }] } }),
    p.review?.deleteMany({ where: { userId } }),
    p.billingRecord?.deleteMany({ where: { userId } }),
    p.tokenPurchase?.deleteMany({ where: { userId } }),
    p.budget?.deleteMany({ where: { userId } }),
  ].filter(Boolean);
  await Promise.allSettled(cleanups);

  await prisma.tokenWallet.deleteMany({ where: { userId } });
  await prisma.usageLog.deleteMany({ where: { userId } });

  // Detach this user as a manager of others before removing them.
  await prisma.user.updateMany({ where: { managerId: userId }, data: { managerId: null } });

  // Finally the user — cascades the remaining child rows (conversations, facts,
  // folders, attachments, memories, tool executions, etc.).
  await prisma.user.delete({ where: { id: userId } });

  logger.info(`User account purged: userId=${userId}`);
}
