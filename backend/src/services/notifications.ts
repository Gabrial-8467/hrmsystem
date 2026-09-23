import type { PrismaClient } from '@prisma/client';

export type NotificationType = 'INFO' | 'SUCCESS' | 'ALERT' | 'ACTION';

export interface NotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}

export interface NotifyService {
  /**
   * Notify one or more users within an organization. Duplicate userIds are
   * collapsed; empty recipient lists are a no-op.
   */
  notify(organizationId: string, userIds: readonly string[], input: NotificationInput): Promise<void>;
}

/** Direct-write notification service used by domain event hooks. */
export function createNotifyService(prisma: PrismaClient): NotifyService {
  return {
    async notify(organizationId, userIds, input) {
      const unique = Array.from(new Set(userIds.filter(Boolean)));
      if (unique.length === 0) return;

      await prisma.notification.createMany({
        data: unique.map((userId) => ({
          organizationId,
          userId,
          title: input.title,
          message: input.message,
          type: input.type ?? 'INFO',
          link: input.link ?? null,
        })),
      });
    },
  };
}