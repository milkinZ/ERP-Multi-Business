import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE_NAMES, type QueueName } from '../../queue/queue.constants';
import { MetricsService } from '../metrics/metrics.service';
import { JwtAuthGuard } from '../../../modules/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../modules/rbac/permission.guard';
import { Permissions } from '../../../common/decorator/permissions.decorator';
import { PERMISSIONS } from '../../../modules/rbac/permissions';

@Controller('admin/monitor')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queueService: QueueService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('status')
  @Permissions(PERMISSIONS.SUPER_ADMIN_MANAGE_SYSTEM)
  async status() {
    const sentryDsn =
      this.config.get<string>('observability.sentry.dsn') ||
      process.env.SENTRY_DSN;
    const grafanaUrl =
      this.config.get<string>('observability.grafanaUrl') ||
      process.env.GRAFANA_URL;

    const result: {
      services: {
        metrics: { enabled: boolean };
        sentry: { configured: boolean; dsn?: string };
        grafana: { url?: string };
        bullBoard: { url: string };
      };
      health: {
        database: { ok: boolean };
        redis: { ok: boolean };
        queues: Record<string, unknown>;
      };
    } = {
      services: {
        metrics: { enabled: this.metrics?.isEnabled?.() ?? false },
        sentry: {
          configured: !!sentryDsn,
          dsn: sentryDsn ? '[REDACTED]' : undefined,
        },
        grafana: { url: grafanaUrl },
        bullBoard: { url: '/admin/queues/ui' },
      },
      health: {
        database: { ok: false },
        redis: { ok: false },
        queues: {},
      },
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      result.health.database.ok = true;
    } catch (err) {
      this.logger.warn(`Database health check failed: ${String(err)}`);
    }

    try {
      const ping = await this.redis.getClient().ping();
      result.health.redis.ok = ping === 'PONG' || ping === 'OK' || !!ping;
    } catch (err) {
      this.logger.warn(`Redis health check failed: ${String(err)}`);
    }

    try {
      const names = Object.values(QUEUE_NAMES) as QueueName[];
      for (const qName of names) {
        try {
          const q = this.queueService.getQueue(qName);
          const counts = await q.getJobCounts(
            'waiting',
            'active',
            'failed',
            'completed',
            'delayed',
          );
          result.health.queues[qName] = counts;
        } catch {
          result.health.queues[qName] = { error: 'unavailable' };
        }
      }
    } catch (err) {
      this.logger.warn(`Queue snapshot failed: ${String(err)}`);
    }

    return result;
  }
}
