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

export type FailedJobSummary = {
  queueName: QueueName;
  jobName: string;
  failedAt: Date;
  attemptsMade: number;
  maxAttempts: number;
};

const FAILED_JOBS_PER_QUEUE = 10;
const MAX_FAILED_JOB_SUMMARIES = 50;

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

  async getFailedJobSummaries(): Promise<FailedJobSummary[]> {
    const queueNames = Object.values(QUEUE_NAMES) as QueueName[];
    const perQueue = await Promise.all(
      queueNames.map(async (queueName) => {
        const queue = this.queueService.getQueue(queueName);
        const jobs = await queue.getFailed(0, FAILED_JOBS_PER_QUEUE - 1);
        return jobs.map((job) => ({
          queueName,
          jobName: this.safeJobName(job.name),
          failedAt: new Date(job.finishedOn ?? job.timestamp),
          attemptsMade: Math.max(0, job.attemptsMade),
          maxAttempts: Math.max(1, Number(job.opts.attempts ?? 1)),
        }));
      }),
    );

    return perQueue
      .flat()
      .sort((left, right) => right.failedAt.getTime() - left.failedAt.getTime())
      .slice(0, MAX_FAILED_JOB_SUMMARIES);
  }

  private safeJobName(name: string | undefined): string {
    const safeName = name?.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
    return safeName || 'unknown';
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
