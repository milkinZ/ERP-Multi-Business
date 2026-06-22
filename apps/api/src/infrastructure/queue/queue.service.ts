import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

import { QueueName } from './queue.constants';

import { RedisService } from '../redis/redis.service';

import { QueueFailureMetadata, QueueProgressMetadata } from './queue.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  private getJobProgressKey(queueName: QueueName, jobId: string) {
    return `queue:${queueName}:job:${jobId}:progress`;
  }

  private getJobFailureKey(queueName: QueueName, jobId: string) {
    return `queue:${queueName}:job:${jobId}:failure`;
  }

  async setJobProgress(
    queueName: QueueName,
    jobId: string,
    metadata: QueueProgressMetadata,
  ): Promise<void> {
    await this.redis
      .getClient()
      .set(this.getJobProgressKey(queueName, jobId), JSON.stringify(metadata));
  }

  async setJobFailure(
    queueName: QueueName,
    jobId: string,
    metadata: QueueFailureMetadata,
  ): Promise<void> {
    await this.redis
      .getClient()
      .set(this.getJobFailureKey(queueName, jobId), JSON.stringify(metadata));
  }

  constructor(private readonly redis: RedisService) {}

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: this.redis.getBullmqConnectionOptions(),

      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    // Ensure DLQ exists (created once per process)
    this.getDlqQueue(name);

    this.queues.set(name, queue);
    return queue;
  }

  private getDlqQueue(name: QueueName): Queue {
    const dlqName = `${name}_DLQ`;

    const existing = this.queues.get(dlqName as unknown as QueueName);
    if (existing) return existing;

    const dlqQueue = new Queue(dlqName, {
      connection: this.redis.getBullmqConnectionOptions(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });

    this.queues.set(dlqName as unknown as QueueName, dlqQueue);
    return dlqQueue;
  }

  async onModuleDestroy() {
    for (const q of this.queues.values()) {
      try {
        await q.close();
      } catch (e) {
        this.logger.warn(e);
      }
    }
    this.queues.clear();
  }
}
