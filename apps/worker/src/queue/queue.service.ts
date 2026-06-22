import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, JobsOptions } from 'bullmq';

import { RedisService } from '../shared/redis.service';
import { QUEUE_NAMES, type QueueName } from './queue.constants';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {}

  getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: this.redis.getConnectionOptions(),
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

    this.queues.set(name, queue);
    return queue;
  }

  async onModuleDestroy() {
    for (const q of this.queues.values()) {
      await q.close();
    }
    this.queues.clear();
  }

  async add(name: QueueName, payload: Record<string, unknown>, opts?: JobsOptions) {
    return this.getQueue(name).add('job', payload, opts);
  }
}

