import prisma from '../config/db.js';
import logger from '../config/logger.js';

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
      message: 'Welcome back to Convoia AI. Start a chat or explore new models.',
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
      title: `Welcome to Convoia AI!`,
      message: `Hi ${name.split(' ')[0]}, your account is ready. Start chatting with 30+ AI models.`,
    });
  }
}
