import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '@prisma/client';

import {
  NotificationChannel,
  NotificationDispatchJobPayload,
} from './notification.types';
import { NotificationChannelHandler } from './notification.channel';

@Injectable()
export class InAppNotificationChannelHandler implements NotificationChannelHandler {
  readonly channel = NotificationChannel.IN_APP;
  private readonly logger = new Logger(InAppNotificationChannelHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(job: NotificationDispatchJobPayload): Promise<void> {
    if (!job.notification.channels.includes(NotificationChannel.IN_APP)) {
      return;
    }

    if (!job.recipientId) {
      this.logger.warn(
        `Skipping in-app notification because recipientId is missing for tenant=${job.tenantId}`,
      );
      return;
    }

    try {
      await this.prisma.notification.create({
        data: {
          tenantId: job.tenantId,
          userId: job.recipientId,
          type: job.notification.type,
          title: job.notification.title,
          message: job.notification.message,
          payload: job.notification.data as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create in-app notification', String(error));
      throw error;
    }
  }
}
