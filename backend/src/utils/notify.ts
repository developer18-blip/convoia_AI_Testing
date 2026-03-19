import prisma from '../config/db.js';
import logger from '../config/logger.js';

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  referenceId?: string,
  referenceType?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        referenceId: referenceId ?? null,
        referenceType: referenceType ?? null,
      },
    });
  } catch (error) {
    // Notification failures should not break the main flow
    logger.error('Failed to create notification', { userId, type, title, error });
  }
}
