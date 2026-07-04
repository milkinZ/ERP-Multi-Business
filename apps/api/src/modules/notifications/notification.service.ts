import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
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

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: NotificationTemplateService,
    private readonly preferenceService: NotificationPreferenceService,
    @Inject(NOTIFICATION_CHANNEL_HANDLERS)
    private readonly channelHandlers: NotificationChannelHandler[],
    private readonly queueService: QueueService,
  ) {}

  async sendNotification(payload: NotificationPayload) {
    const template = this.templateService.buildNotification(
      payload.type,
      payload.data ?? {},
      payload.channels,
    );

    const channels = payload.channels ?? template.channels;
    const effectiveChannels = this.preferenceService.getEffectiveChannels(
      payload.userId,
      channels,
    );

    const dispatchPayload: NotificationDispatchJobPayload = {
      recipientId: payload.userId,
      tenantId: payload.tenantId,
      notification: {
        type: payload.type,
        title: payload.title ?? template.title,
        message: payload.message ?? template.message,
        channels: effectiveChannels,
        data: payload.data ?? {},
      },
    };

    const handlers = this.channelHandlers.filter((handler) =>
      dispatchPayload.notification.channels.includes(handler.channel),
    );

    if (handlers.length === 0) {
      this.logger.warn(
        `No notification channel handlers found for channels=[${effectiveChannels.join(', ')}]`,
      );
      return;
    }

    await Promise.all(handlers.map((handler) => handler.send(dispatchPayload)));

    if (
      effectiveChannels.includes(NotificationChannel.EMAIL) &&
      !effectiveChannels.includes(NotificationChannel.IN_APP)
    ) {
      this.queueService.getQueue(QUEUE_NAMES.NOTIFICATION_QUEUE);
    }
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

  async markAsRead(id: string, tenantId: string) {
    return this.prisma.notification.updateMany({
      where: {
        id,
        tenantId,
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
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async deleteNotification(id: string) {
    return this.prisma.notification.update({
      where: {
        id,
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
