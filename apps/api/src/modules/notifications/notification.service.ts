import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import {
  NotificationChannel,
  NotificationPayload,
  NotificationDispatchJobPayload,
} from './notification.types';
import { NotificationTemplateService } from './notification.template.service';
import { NotificationPreferenceService } from './notification.preference.service';
import {
  NotificationChannelHandler,
  NOTIFICATION_CHANNEL_HANDLERS,
} from './notification.channel';
import { NotificationRecipientService } from './notification-recipient.service';

type AuthorizedNotification = Omit<NotificationPayload, 'userId'> & {
  requiredPermission: string;
};

const RECIPIENT_BATCH_SIZE = 25;

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: NotificationTemplateService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly recipientService: NotificationRecipientService,
    @Inject(NOTIFICATION_CHANNEL_HANDLERS)
    private readonly channelHandlers: NotificationChannelHandler[],
  ) {}

  async dispatchToAuthorizedRecipients(payload: AuthorizedNotification) {
    const recipientIds = payload.outletId
      ? await this.recipientService.findForOutlet(
          payload.tenantId,
          payload.outletId,
          payload.requiredPermission,
        )
      : await this.recipientService.findForTenant(
          payload.tenantId,
          payload.requiredPermission,
        );

    for (
      let offset = 0;
      offset < recipientIds.length;
      offset += RECIPIENT_BATCH_SIZE
    ) {
      const batch = recipientIds.slice(offset, offset + RECIPIENT_BATCH_SIZE);
      await Promise.all(
        batch.map((userId) => this.sendNotification({ ...payload, userId })),
      );
    }

    return { recipientCount: recipientIds.length };
  }

  async sendNotification(payload: NotificationPayload) {
    const template =
      payload.title && payload.message
        ? undefined
        : this.templateService.buildNotification(
            payload.type,
            payload.data ?? {},
            payload.channels,
          );
    const channels = payload.channels ??
      template?.channels ?? [
        NotificationChannel.IN_APP,
        NotificationChannel.EMAIL,
      ];
    const effectiveChannels = await this.preferenceService.getEffectiveChannels(
      payload.userId,
      payload.tenantId,
      payload.category,
      channels,
    );

    if (!effectiveChannels.length) return;

    const dispatchPayload: NotificationDispatchJobPayload = {
      recipientId: payload.userId,
      tenantId: payload.tenantId,
      outletId: payload.outletId,
      notification: {
        type: payload.type,
        category: payload.category,
        sourceEventId: payload.sourceEventId,
        title: payload.title ?? template?.title,
        message: payload.message ?? template?.message,
        channels: effectiveChannels,
        data: payload.data ?? {},
      },
    };

    const handlers = this.channelHandlers.filter((handler) =>
      effectiveChannels.includes(handler.channel),
    );
    if (!handlers.length) {
      throw new Error(
        `No handlers registered for notification channels [${effectiveChannels.join(', ')}]`,
      );
    }

    await Promise.all(handlers.map((handler) => handler.send(dispatchPayload)));
  }

  async getUserNotifications(
    userId: string,
    tenantId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          userId,
          tenantId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({
        where: {
          userId,
          tenantId,
          deletedAt: null,
        },
      }),
    ]);

    return {
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  getUserPreferences(userId: string, tenantId: string) {
    return this.preferenceService.getUserPreferences(userId, tenantId);
  }

  updateUserPreferences(
    userId: string,
    tenantId: string,
    preferences: Parameters<
      NotificationPreferenceService['updateUserPreferences']
    >[2],
  ) {
    return this.preferenceService.updateUserPreferences(
      userId,
      tenantId,
      preferences,
    );
  }

  async markAsRead(id: string, userId: string, tenantId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id,
        userId,
        tenantId,
        deletedAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: string, tenantId: string) {
    return this.prisma.notification.updateMany({
      where: {
        userId,
        tenantId,
        readAt: null,
        deletedAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async deleteNotification(id: string, userId: string, tenantId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id,
        userId,
        tenantId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getUnreadCount(userId: string, tenantId: string) {
    return this.prisma.notification.count({
      where: {
        userId,
        tenantId,
        readAt: null,
        deletedAt: null,
      },
    });
  }
}
