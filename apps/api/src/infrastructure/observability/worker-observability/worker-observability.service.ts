import { Injectable, Logger } from '@nestjs/common';

import { MetricsService } from '../metrics/metrics.service';

/**
 * Worker / cron observability helper.
 *
 * Tracks job execution durations and outcomes for background workers and
 * scheduled jobs. Feeds Prometheus metrics only; never throws.
 */
@Injectable()
export class WorkerObservabilityService {
  private readonly logger = new Logger(WorkerObservabilityService.name);

  constructor(private readonly metrics: MetricsService) {}

  async instrument<T>(
    queueOrJobType: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      const durationMs = Date.now() - start;
      this.metrics.queueJobsCompleted.inc({ queue: queueOrJobType });
      this.logger.debug(`${queueOrJobType} completed in ${durationMs}ms`);
      return result;
    } catch (err) {
      const durationMs = Date.now() - start;
      this.metrics.queueJobsFailed.inc({ queue: queueOrJobType });
      this.logger.error(
        `${queueOrJobType} failed after ${durationMs}ms: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      throw err;
    }
  }

  recordJobStarted(queue: string): void {
    this.metrics.queueJobsActive.inc({ queue });
  }

  recordJobFinished(queue: string): void {
    this.metrics.queueJobsActive.dec({ queue });
  }

  recordQueueDepth(queue: string, waiting: number): void {
    this.metrics.queueJobsWaiting.set({ queue }, waiting);
  }
}
