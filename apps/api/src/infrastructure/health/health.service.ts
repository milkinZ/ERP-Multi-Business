import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { QueueService } from '../queue/queue.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class HealthService {
  constructor(
    private prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly storageService: StorageService,
  ) {}

  async checkDb() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'db_error';
      return { ok: false, error: message };
    }
  }

  async checkBullmq() {
    const queues = [
      QUEUE_NAMES.ORDER_QUEUE,
      QUEUE_NAMES.INVENTORY_QUEUE,
      QUEUE_NAMES.ANALYTICS_QUEUE,
      QUEUE_NAMES.EMAIL_QUEUE,
      QUEUE_NAMES.PDF_QUEUE,
      QUEUE_NAMES.NOTIFICATION_QUEUE,
    ] as const;

    const results: Record<string, { ok: boolean; reason?: string }> = {};

    // Connectivity + responsiveness (get counts + waitUntilReady)
    for (const qName of queues) {
      try {
        const queue = this.queueService.getQueue(qName);
        await queue.waitUntilReady();
        await queue.getJobCounts();
        results[qName] = { ok: true };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'bullmq_error';
        results[qName] = { ok: false, reason: message };
      }
    }

    const failures = Object.values(results).filter((r) => !r.ok);

    if (failures.length === 0) {
      return { ok: true, status: 'UP', details: results };
    }

    // If at least one queue works but one fails => DEGRADED
    const oks = Object.values(results).filter((r) => r.ok);
    if (oks.length > 0) {
      return { ok: false, status: 'DEGRADED', details: results };
    }

    return { ok: false, status: 'DOWN', details: results };
  }
  async checkOutbox() {
    try {
      const pending = await this.prisma.outboxEvent.count({
        where: { status: 'PENDING' },
      });
      return { ok: true, pending };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'outbox_error';
      return { ok: false, error: message };
    }
  }

  async checkStorage() {
    try {
      await this.storageService.listFiles('');
      return {
        ok: true,
        status: 'UP',
        provider: this.storageService.getStorageType(),
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'storage_error';
      return {
        ok: false,
        status: 'DOWN',
        provider: this.storageService.getStorageType(),
        error: message,
      };
    }
  }

  async checkWorker() {
    const queues = Object.values(QUEUE_NAMES);
    const results: Record<
      string,
      { ok: boolean; workers?: number; reason?: string }
    > = {};

    for (const qName of queues) {
      try {
        const queue = this.queueService.getQueue(qName);
        await queue.waitUntilReady();
        const workers = await queue.getWorkers();
        results[qName] =
          workers.length > 0
            ? { ok: true, workers: workers.length }
            : { ok: false, workers: 0, reason: 'no_active_workers' };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'worker_error';
        results[qName] = { ok: false, reason: message };
      }
    }

    const healthy = Object.values(results).filter((result) => result.ok);
    const status =
      healthy.length === queues.length
        ? 'UP'
        : healthy.length > 0
          ? 'DEGRADED'
          : 'DOWN';

    return { ok: status === 'UP', status, details: results };
  }
}
