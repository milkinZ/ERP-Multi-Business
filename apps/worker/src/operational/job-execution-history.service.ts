import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { Job } from "bullmq";
import { Queue, QueueEvents } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "../queue/queue.constants";
import { RedisService } from "../shared/redis.service";
import { PrismaService } from "../shared/prisma.service";
import { WorkerRegistryService } from "./worker-registry.service";

export type JobExecutionStatus = "ACTIVE" | "RETRYING" | "COMPLETED" | "FAILED";

@Injectable()
export class JobExecutionHistoryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(JobExecutionHistoryService.name);
  private readonly queues = new Map<QueueName, Queue>();
  private readonly queueEvents = new Map<QueueName, QueueEvents>();
  private readonly jobSnapshots = new Map<
    string,
    {
      jobName: string | undefined;
      attemptNumber: number;
      maxAttempts: number;
      startedAt: Date;
      correlationId: string | null;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly workerRegistry: WorkerRegistryService,
  ) {}

  async onModuleInit() {
    for (const queueName of Object.values(QUEUE_NAMES)) {
      this.attachQueue(queueName);
    }
  }

  async onModuleDestroy() {
    for (const events of this.queueEvents.values()) {
      await events.close();
    }

    for (const queue of this.queues.values()) {
      await queue.close();
    }

    this.queueEvents.clear();
    this.queues.clear();
    this.jobSnapshots.clear();
  }

  private attachQueue(queueName: QueueName) {
    const connection = this.redis.getConnectionOptions();
    const queue = new Queue(queueName, { connection });
    const events = new QueueEvents(queueName, { connection });

    events.on("active", ({ jobId }) => {
      void this.handleActive(queueName, jobId);
    });

    events.on("completed", ({ jobId }) => {
      void this.handleCompleted(queueName, jobId);
    });

    events.on("failed", ({ jobId, failedReason }) => {
      void this.handleFailed(queueName, jobId, failedReason);
    });

    this.queues.set(queueName, queue);
    this.queueEvents.set(queueName, events);
  }

  private async handleActive(queueName: QueueName, jobId: string) {
    const job = await this.getJob(queueName, jobId);
    if (!job) {
      return;
    }

    const attemptNumber = this.resolveAttemptNumber(job);
    const startedAt = this.resolveStartedAt(job);
    const maxAttempts = Number(job.opts?.attempts ?? 1);
    const workerId = this.workerRegistry.getCurrentWorkerId();
    const key = this.toSnapshotKey(queueName, jobId);
    this.jobSnapshots.set(key, {
      jobName: job.name,
      attemptNumber,
      maxAttempts,
      startedAt,
      correlationId: this.extractCorrelationId(job.data),
    });

    await this.persistExecution({
      queueName,
      bullmqJobId: jobId,
      jobName: job.name,
      attemptNumber,
      status: "ACTIVE",
      workerId,
      startedAt,
      correlationId: this.extractCorrelationId(job.data),
    });
  }

  private async handleCompleted(queueName: QueueName, jobId: string) {
    const snapshot = this.jobSnapshots.get(this.toSnapshotKey(queueName, jobId));
    if (!snapshot) {
      return;
    }

    const finishedAt = new Date();
    const durationMs = Math.max(
      0,
      finishedAt.getTime() - snapshot.startedAt.getTime(),
    );

    await this.persistExecution({
      queueName,
      bullmqJobId: jobId,
      jobName: snapshot.jobName,
      attemptNumber: snapshot.attemptNumber,
      status: "COMPLETED",
      workerId: this.workerRegistry.getCurrentWorkerId(),
      startedAt: snapshot.startedAt,
      finishedAt,
      durationMs,
      correlationId: snapshot.correlationId,
    });
  }

  private async handleFailed(queueName: QueueName, jobId: string, failedReason: string) {
    const snapshot = this.jobSnapshots.get(this.toSnapshotKey(queueName, jobId));
    if (!snapshot) {
      return;
    }

    const finishedAt = new Date();
    const durationMs = Math.max(
      0,
      finishedAt.getTime() - snapshot.startedAt.getTime(),
    );

    const { category, message } = this.sanitizeFailure(failedReason);
    const status: JobExecutionStatus =
      snapshot.attemptNumber < snapshot.maxAttempts ? "RETRYING" : "FAILED";

    await this.persistExecution({
      queueName,
      bullmqJobId: jobId,
      jobName: snapshot.jobName,
      attemptNumber: snapshot.attemptNumber,
      status,
      workerId: this.workerRegistry.getCurrentWorkerId(),
      startedAt: snapshot.startedAt,
      finishedAt,
      durationMs,
      errorCategory: category,
      errorMessage: message,
      correlationId: snapshot.correlationId,
    });
  }

  private async getJob(queueName: QueueName, jobId: string): Promise<Job | null> {
    const queue =
      this.queues.get(queueName) ??
      new Queue(queueName, { connection: this.redis.getConnectionOptions() });

    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, queue);
    }

    const job = await queue.getJob(jobId);
    return job ?? null;
  }

  private resolveAttemptNumber(job: Job): number {
    const attemptsMade = Number(job.attemptsMade ?? 1);
    return Number.isFinite(attemptsMade) && attemptsMade > 0 ? attemptsMade : 1;
  }

  private resolveStartedAt(job: Job): Date {
    const value = job.processedOn ?? job.timestamp ?? Date.now();
    return new Date(value);
  }

  private extractCorrelationId(data: unknown): string | null {
    if (typeof data === "object" && data !== null) {
      const candidate = data as Record<string, unknown>;
      if (typeof candidate.correlationId === "string") {
        return candidate.correlationId;
      }
    }
    return null;
  }

  private toSnapshotKey(queueName: QueueName, jobId: string): string {
    return `${queueName}:${jobId}`;
  }

  private sanitizeFailure(failedReason: string): {
    category: string;
    message: string;
  } {
    const message = failedReason
      .replace(/(password|secret|token|api[_-]?key|authorization)=([^\s]+)/gi, "$1=[REDACTED]")
      .replace(/(Bearer\s+[A-Za-z0-9._-]+)/gi, "Bearer [REDACTED]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    const lowered = message.toLowerCase();
    if (/(database|prisma|postgres|sql|duplicate key|connection reset)/i.test(message)) {
      return { category: "DATABASE_ERROR", message };
    }
    if (/(validation|zod|required|missing|invalid|bad request)/i.test(message)) {
      return { category: "VALIDATION_ERROR", message };
    }
    if (/(xendit|stripe|sendgrid|external|fetch failed|provider|http status)/i.test(message)) {
      return { category: "EXTERNAL_PROVIDER_ERROR", message };
    }
    if (/(timeout|timed out|abort|etimedout|econnreset)/i.test(message)) {
      return { category: "TIMEOUT", message };
    }
    if (/(error|exception|throw)/i.test(message)) {
      return { category: "APPLICATION_ERROR", message };
    }

    return { category: "UNKNOWN", message };
  }

  private async persistExecution(args: {
    queueName: string;
    bullmqJobId: string;
    jobName: string | undefined;
    attemptNumber: number;
    status: JobExecutionStatus;
    workerId: string | null;
    startedAt?: Date;
    finishedAt?: Date;
    durationMs?: number;
    errorCategory?: string | null;
    errorMessage?: string | null;
    correlationId?: string | null;
  }) {
    const now = new Date();
    const record = await this.prisma.jobExecution.upsert({
      where: {
        queueName_bullmqJobId_attemptNumber: {
          queueName: args.queueName,
          bullmqJobId: args.bullmqJobId,
          attemptNumber: args.attemptNumber,
        },
      },
      create: {
        queueName: args.queueName,
        bullmqJobId: args.bullmqJobId,
        jobName: args.jobName ?? null,
        workerId: args.workerId,
        attemptNumber: args.attemptNumber,
        status: args.status,
        startedAt: args.startedAt ?? now,
        finishedAt: args.finishedAt ?? null,
        durationMs: args.durationMs ?? null,
        errorCategory: args.errorCategory ?? null,
        errorMessage: args.errorMessage ?? null,
        correlationId: args.correlationId ?? null,
      },
      update: {
        jobName: args.jobName ?? undefined,
        workerId: args.workerId ?? undefined,
        status: args.status,
        startedAt: args.startedAt ?? undefined,
        finishedAt: args.finishedAt ?? undefined,
        durationMs: args.durationMs ?? undefined,
        errorCategory: args.errorCategory ?? undefined,
        errorMessage: args.errorMessage ?? undefined,
        correlationId: args.correlationId ?? undefined,
      },
    });

    if (!record) {
      this.logger.warn(
        `Job execution history for ${args.queueName}/${args.bullmqJobId} attempt ${args.attemptNumber} could not be persisted.`,
      );
    }
  }
}
