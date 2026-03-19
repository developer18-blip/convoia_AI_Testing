import prisma from '../config/db.js';

/**
 * Ensures a user has a valid organizationId.
 * If the user has no org, finds or creates a "Personal" org for them.
 */
export async function getOrCreatePersonalOrg(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, email: true },
  });

  if (user?.organizationId) return user.organizationId;

  let personalOrg = await prisma.organization.findFirst({
    where: { name: 'Personal', ownerId: userId },
  });

  if (!personalOrg) {
    personalOrg = await prisma.organization.create({
      data: {
        name: 'Personal',
        email: user?.email || `${userId}@personal.convoia`,
        ownerId: userId,
        tier: 'free',
        status: 'active',
      },
    });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: personalOrg.id },
  });

  return personalOrg.id;
}
