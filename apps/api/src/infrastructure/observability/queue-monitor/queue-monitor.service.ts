import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { QueueService } from '../../queue/queue.service';
import { QUEUE_NAMES, type QueueName } from '../../queue/queue.constants';

import { MetricsService } from '../metrics/metrics.service';

export type QueueSnapshot = {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

/**
 * Queue-monitoring service.
 *
 * Reads BullMQ queue statistics and feeds them to Prometheus metrics.
 * Used by the Super Admin queue-monitor endpoints.
 */
@Injectable()
export class QueueMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueMonitorService.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly metrics: MetricsService,
  ) {}

  async getQueueSnapshots(): Promise<QueueSnapshot[]> {
    const snapshots: QueueSnapshot[] = [];
    const queueNames = Object.values(QUEUE_NAMES) as QueueName[];

    for (const name of queueNames) {
      try {
        const queue = this.queueService.getQueue(name);
        snapshots.push(await this.snapshot(name, queue));
      } catch (err) {
        this.logger.warn(`Failed to snapshot queue ${name}: ${err}`);
      }
    }

    return snapshots;
  }

  async getQueueSnapshot(name: QueueName): Promise<QueueSnapshot | null> {
    try {
      const queue = this.queueService.getQueue(name);
      return await this.snapshot(name, queue);
    } catch (err) {
      this.logger.warn(`Failed to snapshot queue ${name}: ${err}`);
      return null;
    }
  }

  private async snapshot(
    name: QueueName,
    queue: Queue,
  ): Promise<QueueSnapshot> {
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const delayed = await queue.getDelayedCount();
    const failed = await queue.getFailedCount();
    const completed = await queue.getCompletedCount();

    // Feed metrics.
    this.metrics.queueJobsWaiting.set({ queue: name }, waiting);
    this.metrics.queueJobsActive.set({ queue: name }, active);
    this.metrics.queueJobsDelayed.set({ queue: name }, delayed);

    return {
      name,
      waiting,
      active,
      delayed,
      failed,
      completed,
    };
  }

  onModuleDestroy() {
    // Queues are owned by QueueService; nothing to close here.
  }
}
