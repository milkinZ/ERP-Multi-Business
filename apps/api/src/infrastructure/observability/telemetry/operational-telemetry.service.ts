import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { OperationalTelemetryQueryDto } from './dto/operational-telemetry-query.dto';

const RETENTION_DAYS = 30;
const MAX_BUFFERED_LOGS = 5_000;
const MAX_BUFFERED_METRIC_KEYS = 2_000;
const MAX_FLUSH_BATCH = 500;
const BUFFER_WARNING_INTERVAL_MS = 60_000;
const MAX_QUERY_RANGE_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;

type MetricAggregate = {
  bucketStart: Date;
  method: string;
  route: string;
  statusClass: string;
  requestCount: number;
  errorCount: number;
  durationTotalMs: number;
};

type EventRecord = {
  level: string;
  eventType: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
};

@Injectable()
export class OperationalTelemetryService implements OnModuleDestroy {
  private readonly logger = new Logger(OperationalTelemetryService.name);
  private readonly metricsBuffer = new Map<string, MetricAggregate>();
  private readonly logsBuffer: EventRecord[] = [];
  private flushing = false;
  private lastBufferWarningAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  recordHttpRequest(
    methodValue: string,
    routeValue: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const method = this.normalizeMethod(methodValue);
    const route = this.normalizeRoute(routeValue);
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    const bucketStart = new Date();
    bucketStart.setSeconds(0, 0);
    const key = JSON.stringify([
      bucketStart.toISOString(),
      method,
      route,
      statusClass,
    ]);

    const aggregate = this.metricsBuffer.get(key);
    if (aggregate) {
      aggregate.requestCount += 1;
      aggregate.errorCount += statusCode >= 500 ? 1 : 0;
      aggregate.durationTotalMs += Math.max(0, Math.round(durationMs));
    } else if (this.metricsBuffer.size < MAX_BUFFERED_METRIC_KEYS) {
      this.metricsBuffer.set(key, {
        bucketStart,
        method,
        route,
        statusClass,
        requestCount: 1,
        errorCount: statusCode >= 500 ? 1 : 0,
        durationTotalMs: Math.max(0, Math.round(durationMs)),
      });
    } else {
      this.warnBufferOverflow(
        'Operational metric buffer limit reached; metric dropped',
      );
    }

    if (statusCode >= 500) {
      this.enqueueLog({
        level: 'ERROR',
        eventType: 'HTTP_REQUEST_ERROR',
        method,
        route,
        statusCode,
        durationMs: Math.max(0, Math.round(durationMs)),
      });
    } else if (durationMs >= 2_000) {
      this.enqueueLog({
        level: 'WARN',
        eventType: 'HTTP_SLOW_RESPONSE',
        method,
        route,
        statusCode,
        durationMs: Math.max(0, Math.round(durationMs)),
      });
    }
  }

  async getHistoricalTelemetry(query: OperationalTelemetryQueryDto) {
    const now = new Date();
    const to = query.to ? new Date(query.to) : now;
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 24 * 60 * 60 * 1_000);

    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to ||
      to > now ||
      to.getTime() - from.getTime() > MAX_QUERY_RANGE_MS
    ) {
      throw new BadRequestException(
        'Telemetry range must be valid, not in the future, and at most 30 days',
      );
    }

    const where = {
      createdAt: { gte: from, lte: to },
    };
    const [metrics, events] = await Promise.all([
      this.prisma.operationalMetricBucket.groupBy({
        by: ['method', 'route', 'statusClass'],
        where: {
          bucketStart: { gte: from, lte: to },
        },
        _sum: {
          requestCount: true,
          errorCount: true,
          durationTotalMs: true,
        },
        orderBy: {
          _sum: { requestCount: 'desc' },
        },
        take: 100,
      }),
      this.prisma.operationalEventLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: Math.min(query.take ?? 50, 100),
        select: {
          id: true,
          level: true,
          eventType: true,
          method: true,
          route: true,
          statusCode: true,
          durationMs: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      range: { from, to },
      retentionDays: RETENTION_DAYS,
      metrics: metrics.map((metric) => ({
        method: metric.method,
        route: metric.route,
        statusClass: metric.statusClass,
        requestCount: metric._sum.requestCount ?? 0,
        errorCount: metric._sum.errorCount ?? 0,
        durationTotalMs: metric._sum.durationTotalMs ?? 0,
      })),
      events,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'operational-telemetry-flush' })
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.flushMetrics();
      await this.flushLogs();
    } finally {
      this.flushing = false;
    }
  }

  @Cron('0 3 * * *', { name: 'operational-telemetry-retention' })
  async purgeExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
    try {
      const [events, metrics] = await this.prisma.$transaction([
        this.prisma.operationalEventLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        }),
        this.prisma.operationalMetricBucket.deleteMany({
          where: { bucketStart: { lt: cutoff } },
        }),
      ]);
      this.logger.log(
        `Operational telemetry retention purged ${events.count} events and ${metrics.count} metric buckets`,
      );
    } catch (error) {
      this.logger.error(
        `Operational telemetry retention failed: ${this.errorCode(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.size === 0) return;
    const batch = [...this.metricsBuffer.entries()].slice(0, MAX_FLUSH_BATCH);
    for (const [key] of batch) this.metricsBuffer.delete(key);

    try {
      await this.prisma.$transaction(
        batch.map(([, metric]) =>
          this.prisma.operationalMetricBucket.upsert({
            where: {
              bucketStart_method_route_statusClass: {
                bucketStart: metric.bucketStart,
                method: metric.method,
                route: metric.route,
                statusClass: metric.statusClass,
              },
            },
            create: metric,
            update: {
              requestCount: { increment: metric.requestCount },
              errorCount: { increment: metric.errorCount },
              durationTotalMs: { increment: metric.durationTotalMs },
            },
          }),
        ),
      );
    } catch (error) {
      let dropped = 0;
      for (const [key, metric] of batch) {
        const existing = this.metricsBuffer.get(key);
        if (existing) {
          existing.requestCount += metric.requestCount;
          existing.errorCount += metric.errorCount;
          existing.durationTotalMs += metric.durationTotalMs;
        } else if (this.metricsBuffer.size < MAX_BUFFERED_METRIC_KEYS) {
          this.metricsBuffer.set(key, metric);
        } else {
          dropped += 1;
        }
      }
      if (dropped > 0) {
        this.warnBufferOverflow(
          `Operational metric retry buffer overflow dropped ${dropped} aggregates`,
        );
      }
      this.logger.error(
        `Operational metric flush failed; batch retained for retry: ${this.errorCode(error)}`,
      );
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.logsBuffer.length === 0) return;
    const batch = this.logsBuffer.splice(0, MAX_FLUSH_BATCH);

    try {
      await this.prisma.operationalEventLog.createMany({
        data: batch,
      });
    } catch (error) {
      const overflow = Math.max(
        0,
        this.logsBuffer.length + batch.length - MAX_BUFFERED_LOGS,
      );
      if (overflow > 0) {
        this.logsBuffer.splice(-overflow, overflow);
        this.warnBufferOverflow(
          `Operational event buffer overflow dropped ${overflow} newer events`,
        );
      }
      this.logsBuffer.unshift(...batch);
      this.logger.error(
        `Operational event flush failed; batch retained for retry: ${this.errorCode(error)}`,
      );
    }
  }

  private enqueueLog(event: EventRecord): void {
    if (this.logsBuffer.length >= MAX_BUFFERED_LOGS) {
      this.warnBufferOverflow(
        'Operational event buffer limit reached; event dropped',
      );
      return;
    }
    this.logsBuffer.push(event);
  }

  private normalizeMethod(method: string): string {
    const upper = method.toUpperCase();
    return [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
    ].includes(upper)
      ? upper
      : 'OTHER';
  }

  private normalizeRoute(route: string): string {
    if (
      route.length > 200 ||
      !/^\/[A-Za-z0-9_./:-]*$/.test(route) ||
      route.includes('..')
    ) {
      return 'unmatched';
    }
    return route;
  }

  private errorCode(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code;
    }
    return error instanceof Error ? error.name : 'UnknownError';
  }

  private warnBufferOverflow(message: string): void {
    const now = Date.now();
    if (now - this.lastBufferWarningAt < BUFFER_WARNING_INTERVAL_MS) return;
    this.lastBufferWarningAt = now;
    this.logger.warn(message);
  }
}
