/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import { QueueEvents } from 'bullmq';

import { QueueName } from './queue.constants';

import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../observability/metrics/metrics.service';

import { QueueFailureMetadata, QueueProgressMetadata } from './queue.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();
  private readonly queueEvents = new Map<QueueName, QueueEvents>();
  private readonly jobStartTimes = new Map<string, number>();

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

  constructor(
    private readonly redis: RedisService,
    private readonly metrics?: MetricsService,
  ) {}

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

    // Attach QueueEvents to capture lifecycle events for metrics
    try {
      const events = new QueueEvents(name, {
        connection: this.redis.getBullmqConnectionOptions(),
      });

      events.on('waiting', () => {
        void (() => {
          try {
            this.metrics?.queueJobsWaiting?.inc({ queue: name }, 1);
          } catch {
            // non-blocking
          }
        })();
      });

      events.on('active', ({ jobId }) => {
        void (async () => {
          try {
            // record start time
            this.jobStartTimes.set(jobId, Date.now());
            this.metrics?.queueJobsActive?.inc({ queue: name }, 1);
            this.metrics?.queueJobsWaiting?.dec({ queue: name }, 1);
            // compute queue latency by fetching job timestamp
            try {
              const job = await queue.getJob(jobId);
              if (job) {
                const latencySec =
                  (Date.now() - (job.timestamp ?? Date.now())) / 1000;
                this.metrics?.queueJobQueueLatency?.observe(
                  { queue: name, jobName: job.name },
                  latencySec,
                );
              }
            } catch {
              // ignore
            }
          } catch {
            // ignore
          }
        })();
      });

      events.on('completed', ({ jobId }) => {
        void (() => {
          try {
            const start = this.jobStartTimes.get(jobId);
            if (start) {
              const dur = (Date.now() - start) / 1000;
              this.metrics?.queueJobDuration?.observe(
                { queue: name, jobName: 'job' },
                dur,
              );
              this.jobStartTimes.delete(jobId);
            }
            this.metrics?.queueJobsCompleted?.inc({ queue: name }, 1);
            this.metrics?.queueJobsActive?.dec({ queue: name }, 1);
          } catch {
            // ignore
          }
        })();
      });

      events.on('failed', ({ jobId }) => {
        void (async () => {
          try {
            // Attempt to inspect job attempts to detect DLQ
            try {
              const job = await queue.getJob(jobId);
              if (job) {
                const attemptsMade = job.attemptsMade ?? 0;
                const maxAttempts = ((job.opts as any)?.attempts ??
                  0) as number;
                if (maxAttempts > 0 && attemptsMade >= maxAttempts) {
                  this.metrics?.queueJobsDeadLettered?.inc({ queue: name }, 1);
                }
              }
            } catch {
              // ignore
            }

            this.metrics?.queueJobsFailed?.inc({ queue: name }, 1);
            this.metrics?.queueJobsActive?.dec({ queue: name }, 1);
          } catch {
            // ignore
          }
        })();
      });

      this.queueEvents.set(name, events);
    } catch {
      // non-blocking if QueueEvents or redis options fail
    }
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
    this.logger.log('Closing QueueEvents...');

    for (const [name, events] of this.queueEvents.entries()) {
      try {
        await events.close();
        this.logger.log(`QueueEvents closed: ${name}`);
      } catch (e) {
        this.logger.warn(
          `Failed to close QueueEvents: ${name}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }

    this.queueEvents.clear();

    this.logger.log('Closing Queues...');

    for (const [name, q] of this.queues.entries()) {
      try {
        await q.close();
        this.logger.log(`Queue closed: ${name}`);
      } catch (e) {
        this.logger.warn(
          `Failed to close Queue: ${name}`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }

    this.queues.clear();

    this.jobStartTimes.clear();

    this.logger.log('QueueService shutdown complete');
  }

  async add(
    name: QueueName,
    payload: Record<string, unknown>,
    opts?: JobsOptions,
  ) {
    // Attempt to create an OpenTelemetry span around job enqueue for observability.
    try {
      // dynamic require to avoid hard dependency

      const api = require('@opentelemetry/api');
      const tracer = api.trace.getTracer('erp-api-queue');
      const span = tracer.startSpan('enqueue_job', {
        attributes: {
          'queue.name': String(name),
        },
      });
      try {
        const result = await this.getQueue(name).add('job', payload, opts);
        try {
          span.setAttribute('job.id', String((result as any)?.id ?? ''));
        } catch {
          // ignore
        }
        span.end();
        return result;
      } catch (err) {
        try {
          span.recordException(err as Error);
          span.setStatus({ code: 2 });
          span.end();
        } catch {
          // ignore
        }
        throw err;
      }
    } catch {
      // OTEL not available or failed; proceed without tracing (non-blocking).
      return this.getQueue(name).add('job', payload, opts);
    }
  }
}
