import { prisma } from './prisma';

export async function createNotification(
  params: { restaurantId: string; type: string; title: string; body?: string; targetRole?: string | null },
  tx: typeof prisma = prisma,
) {
  return tx.notification.create({
    data: {
      restaurantId: params.restaurantId,
      type: params.type,
      title: params.title,
      body: params.body,
      targetRole: (params.targetRole as any) ?? null,
    },
  });
}
