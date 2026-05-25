import prisma from '../config/db.js';
import logger from '../config/logger.js';

// Opt-out model: a user with no NotificationPreference row is treated as all-true.
export const NOTIFICATION_PREFERENCE_DEFAULTS = {
  emailDigest: true,
  inAppNotifications: true,
  memberAlerts: true,
} as const;

export interface ResolvedNotificationPreferences {
  emailDigest: boolean;
  inAppNotifications: boolean;
  memberAlerts: boolean;
}

export class NotificationService {
  static async create(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    referenceId?: string;
    referenceType?: string;
  }) {
    try {
      return await prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          referenceId: params.referenceId || null,
          referenceType: params.referenceType || null,
        },
      });
    } catch (err) {
      logger.error(`Failed to create notification: ${err}`);
      return null;
    }
  }

  static async onLogin(userId: string, name: string) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return this.create({
      userId,
      type: 'login',
      title: `${greeting}, ${name.split(' ')[0]}!`,
      message: 'Welcome back to ConvoiaAI. Start a chat or explore new models.',
    });
  }

  static async onChatComplete(userId: string, modelName: string, tokensUsed: number) {
    return this.create({
      userId,
      type: 'chat_complete',
      title: 'Query completed',
      message: `${modelName} used ${tokensUsed.toLocaleString()} tokens.`,
      referenceType: 'chat',
    });
  }

  static async onTokenPurchase(userId: string, tokens: number) {
    return this.create({
      userId,
      type: 'token_purchase',
      title: 'Tokens added!',
      message: `${tokens.toLocaleString()} tokens have been added to your balance.`,
      referenceType: 'purchase',
    });
  }

  static async onTokenAllocation(userId: string, tokens: number, fromName: string) {
    return this.create({
      userId,
      type: 'token_allocation',
      title: 'Tokens received',
      message: `${fromName} allocated ${tokens.toLocaleString()} tokens to you.`,
      referenceType: 'allocation',
    });
  }

  static async onLowBalance(userId: string, balance: number) {
    // WALLET_LOW is an org-activity notification — respect the in-app channel toggle.
    const prefs = await this.getPreferences(userId);
    if (!prefs.inAppNotifications) return null;
    return this.create({
      userId,
      type: 'low_balance',
      title: 'Low token balance',
      message: `You have ${balance.toLocaleString()} tokens remaining. Consider buying more.`,
    });
  }

  static async onWelcome(userId: string, name: string) {
    return this.create({
      userId,
      type: 'welcome',
      title: `Welcome to ConvoiaAI!`,
      message: `Hi ${name.split(' ')[0]}, your account is ready. Start chatting with 30+ AI models.`,
    });
  }

  /**
   * MEMBER_JOINED — notify the org owner + managers (deduped, excluding the
   * joiner) when someone joins the organization. Gated per-recipient by the
   * in-app channel toggle AND the member-alerts type toggle. Reuses the
   * existing 'team_member_joined' notification type.
   */
  static async onMemberJoined(params: {
    organizationId: string;
    joinerUserId: string;
    joinerName: string;
    role: string;
  }) {
    const { organizationId, joinerUserId, joinerName, role } = params;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerId: true, name: true },
    });
    if (!org) return;

    const privileged = await prisma.user.findMany({
      where: { organizationId, role: { in: ['org_owner', 'manager'] } },
      select: { id: true },
    });

    const recipientIds = new Set<string>(privileged.map(u => u.id));
    recipientIds.add(org.ownerId);
    recipientIds.delete(joinerUserId); // never notify the person who just joined

    for (const userId of recipientIds) {
      const prefs = await this.getPreferences(userId);
      if (!prefs.inAppNotifications || !prefs.memberAlerts) continue;
      await this.create({
        userId,
        type: 'team_member_joined',
        title: 'New team member joined',
        message: `${joinerName} joined ${org.name} as ${role}.`,
        referenceId: organizationId,
        referenceType: 'organization',
      });
    }
  }

  /**
   * Resolve a user's notification preferences, applying the "no row = all
   * defaults true" (opt-out) model so callers never see null.
   */
  static async getPreferences(userId: string): Promise<ResolvedNotificationPreferences> {
    const row = await prisma.notificationPreference.findUnique({ where: { userId } });
    return {
      emailDigest: row?.emailDigest ?? NOTIFICATION_PREFERENCE_DEFAULTS.emailDigest,
      inAppNotifications: row?.inAppNotifications ?? NOTIFICATION_PREFERENCE_DEFAULTS.inAppNotifications,
      memberAlerts: row?.memberAlerts ?? NOTIFICATION_PREFERENCE_DEFAULTS.memberAlerts,
    };
  }

  /**
   * Upsert a user's notification preferences (lazy row creation on first
   * write). Accepts a partial patch; unspecified fields keep their current
   * value (or the default if no row exists yet).
   */
  static async updatePreferences(
    userId: string,
    patch: Partial<ResolvedNotificationPreferences>,
  ): Promise<ResolvedNotificationPreferences> {
    const row = await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: { ...patch },
    });
    return {
      emailDigest: row.emailDigest,
      inAppNotifications: row.inAppNotifications,
      memberAlerts: row.memberAlerts,
    };
  }
}
