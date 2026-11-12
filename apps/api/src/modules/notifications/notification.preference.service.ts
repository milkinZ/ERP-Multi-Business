import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import {
  NotificationCategory,
  NotificationChannel,
  NOTIFICATION_CATEGORIES,
} from './notification.types';

export type NotificationPreferenceInput = {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
};

const CHANNELS = [
  { channel: NotificationChannel.IN_APP, key: 'inApp' },
  { channel: NotificationChannel.EMAIL, key: 'email' },
] as const;

@Injectable()
export class NotificationPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserPreferences(userId: string, tenantId: string) {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { userId, tenantId },
      select: { category: true, channel: true, enabled: true },
    });
    const storedValues = new Map(
      stored.map((item) => [`${item.category}:${item.channel}`, item.enabled]),
    );

    return NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      inApp:
        storedValues.get(`${category}:${NotificationChannel.IN_APP}`) ?? true,
      email:
        storedValues.get(`${category}:${NotificationChannel.EMAIL}`) ?? true,
    }));
  }

  async updateUserPreferences(
    userId: string,
    tenantId: string,
    preferences: NotificationPreferenceInput[],
  ) {
    const seen = new Set<NotificationCategory>();
    for (const preference of preferences) {
      if (!NOTIFICATION_CATEGORIES.includes(preference.category)) {
        throw new BadRequestException('Unknown notification category');
      }
      if (seen.has(preference.category)) {
        throw new BadRequestException(
          'Notification categories must not be duplicated',
        );
      }
      seen.add(preference.category);
    }

    await this.prisma.$transaction(
      preferences.flatMap((preference) =>
        CHANNELS.map(({ channel, key }) =>
          this.prisma.notificationPreference.upsert({
            where: {
              tenantId_userId_category_channel: {
                tenantId,
                userId,
                category: preference.category,
                channel,
              },
            },
            create: {
              tenantId,
              userId,
              category: preference.category,
              channel,
              enabled: preference[key],
            },
            update: { enabled: preference[key] },
          }),
        ),
      ),
    );

    return this.getUserPreferences(userId, tenantId);
  }

  async getEffectiveChannels(
    userId: string,
    tenantId: string,
    category: NotificationCategory,
    requestedChannels: NotificationChannel[],
  ): Promise<NotificationChannel[]> {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: {
        userId,
        tenantId,
        category,
        channel: { in: requestedChannels },
      },
      select: { channel: true, enabled: true },
    });
    const enabledByChannel = new Map(
      preferences.map((preference) => [preference.channel, preference.enabled]),
    );

    return requestedChannels.filter(
      (channel) => enabledByChannel.get(channel) !== false,
    );
  }
}
