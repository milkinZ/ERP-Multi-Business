import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { QueueService } from '../../infrastructure/queue/queue.service';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import {
  NotificationChannel,
  NotificationDispatchJobPayload,
} from './notification.types';
import { NotificationChannelHandler } from './notification.channel';

@Injectable()
export class EmailNotificationChannelHandler implements NotificationChannelHandler {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailNotificationChannelHandler.name);

  constructor(private readonly queueService: QueueService) {}

  async send(job: NotificationDispatchJobPayload): Promise<void> {
    if (!job.notification.channels.includes(NotificationChannel.EMAIL)) {
      return;
    }

    try {
      const queue: Queue = this.queueService.getQueue(
        QUEUE_NAMES.NOTIFICATION_QUEUE,
      );

      await queue.add('notification.dispatch', job, {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (error) {
      this.logger.error(
        'Failed to enqueue email notification dispatch job',
        String(error),
      );
      throw error;
    }
  }
}
