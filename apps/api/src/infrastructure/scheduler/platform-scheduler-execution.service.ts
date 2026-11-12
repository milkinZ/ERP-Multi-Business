import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { PlatformSchedulerExecutionQueryDto } from './platform-scheduler-execution-query.dto';
import { PlatformOperationsRealtimeService } from '../websocket/platform-realtime/platform-operations-realtime.service';

const RETENTION_DAYS = 30;

@Injectable()
export class PlatformSchedulerExecutionService {
  private readonly logger = new Logger(PlatformSchedulerExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly realtime?: PlatformOperationsRealtimeService,
  ) {}

  async execute<T>(
    schedulerName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    let executionId: string | undefined;

    try {
      const [execution] = await this.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "PlatformSchedulerExecution" ("id", "schedulerName", "startedAt", "status", "createdAt", "updatedAt")
        VALUES (${`sched_${randomUUID()}`}, ${schedulerName}, ${startedAt}, 'RUNNING', NOW(), NOW())
        RETURNING "id"
      `;
      if (!execution) throw new Error('Scheduler run id was not returned');
      executionId = execution.id;
    } catch (error) {
      this.logger.error(
        `Could not persist scheduler start for ${schedulerName}: ${this.errorCode(error)}`,
      );
    }

    try {
      const result = await operation();
      await this.finish(executionId, schedulerName, startedAt, 'SUCCEEDED');
      await this.realtime?.publishRefresh();
      return result;
    } catch (error) {
      await this.finish(
        executionId,
        schedulerName,
        startedAt,
        'FAILED',
        this.errorCode(error),
      );
      await this.realtime?.publishRefresh();
      throw error;
    }
  }

  async list(query: PlatformSchedulerExecutionQueryDto) {
    const now = new Date();
    const retentionCutoff = new Date(
      now.getTime() - RETENTION_DAYS * 86_400_000,
    );
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (
      (from && !Number.isFinite(from.getTime())) ||
      (to && !Number.isFinite(to.getTime())) ||
      (from && to && from >= to) ||
      (from && from > now) ||
      (to && to > now) ||
      (from && from < retentionCutoff) ||
      (to && to < retentionCutoff)
    ) {
      throw new BadRequestException(
        'Scheduler history range must be valid and within 30 days',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const filters: Prisma.Sql[] = [
      Prisma.sql`"startedAt" >= ${retentionCutoff}`,
    ];
    if (from) filters.push(Prisma.sql`"startedAt" >= ${from}`);
    if (to) filters.push(Prisma.sql`"startedAt" <= ${to}`);
    if (query.schedulerName) {
      filters.push(Prisma.sql`"schedulerName" = ${query.schedulerName}`);
    }
    if (query.status)
      filters.push(
        Prisma.sql`"status" = ${query.status}::"PlatformSchedulerRunStatus"`,
      );
    const where =
      filters.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
        : Prisma.empty;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          schedulerName: string;
          status: string;
          startedAt: Date;
          finishedAt: Date | null;
          durationMs: number | null;
          errorCode: string | null;
        }>
      >`
        SELECT "id", "schedulerName", "status", "startedAt", "finishedAt", "durationMs", "errorCode"
        FROM "PlatformSchedulerExecution"
        ${where}
        ORDER BY "startedAt" DESC, "id" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*)::bigint AS "total"
        FROM "PlatformSchedulerExecution"
        ${where}
      `,
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total: Number(total[0]?.total ?? 0),
        totalPages: Math.ceil(Number(total[0]?.total ?? 0) / limit),
      },
      retentionDays: RETENTION_DAYS,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, {
    name: 'scheduler-execution-retention',
  })
  async purgeExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
    await this.execute('scheduler-execution-retention', async () => {
      const [schedulerRuns, jobAttempts] = await Promise.all([
        this.prisma.$executeRaw`
        DELETE FROM "PlatformSchedulerExecution" WHERE "startedAt" < ${cutoff}
        `,
        this.prisma.$executeRaw`
          DELETE FROM "JobExecution" WHERE "createdAt" < ${cutoff}
        `,
      ]);
      this.logger.log(
        `Operational history retention purged ${schedulerRuns} scheduler runs and ${jobAttempts} job attempts`,
      );
    });
  }

  private async finish(
    executionId: string | undefined,
    schedulerName: string,
    startedAt: Date,
    status: 'SUCCEEDED' | 'FAILED',
    errorCode: string | null = null,
  ): Promise<void> {
    if (!executionId) return;

    try {
      const finishedAt = new Date();
      await this.prisma.$executeRaw`
        UPDATE "PlatformSchedulerExecution"
        SET "status" = ${status}::"PlatformSchedulerRunStatus",
            "finishedAt" = ${finishedAt},
            "durationMs" = ${Math.max(0, finishedAt.getTime() - startedAt.getTime())},
            "errorCode" = ${errorCode},
            "updatedAt" = NOW()
        WHERE "id" = ${executionId}
      `;
    } catch (error) {
      this.logger.error(
        `Could not persist scheduler completion for ${schedulerName}: ${this.errorCode(error)}`,
      );
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return /^P\d{4}$/.test(error.code) ? error.code : 'DATABASE_ERROR';
    }
    if (
      error instanceof Error &&
      [
        'AbortError',
        'Error',
        'EvalError',
        'RangeError',
        'ReferenceError',
        'SyntaxError',
        'TimeoutError',
        'TypeError',
        'URIError',
      ].includes(error.name)
    ) {
      return error.name;
    }
    return error instanceof Error ? 'APPLICATION_ERROR' : 'UnknownError';
  }
}
