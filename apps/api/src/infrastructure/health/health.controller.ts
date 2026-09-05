import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthCheck as RedisHealthCheck } from '../redis/redis.health-indicator';

@Controller('health')
export class HealthController {
  constructor(
    private healthService: HealthService,
    private readonly redisHealth: RedisHealthCheck,
  ) {}

  @Get()
  async health() {
    const db = await this.healthService.checkDb();

    let redis: { ok: boolean; reason?: string } = { ok: true };
    try {
      await this.redisHealth.checkRedis();
    } catch (e: unknown) {
      redis = {
        ok: false,
        reason: e instanceof Error ? e.message : 'redis_error',
      };
    }

    return {
      success: true,
      message: 'Health check OK',
      data: {
        database: db,
        redis,
        bullmq: await this.healthService.checkBullmq(),
        outbox: await this.healthService.checkOutbox(),
        storage: { ok: false, reason: 'Storage module not enabled (Phase 11)' },
        worker: { ok: false, reason: 'Worker app not enabled (Phase 6)' },
      },
    };
  }

  @Get('readiness')
  async readiness() {
    const db = await this.healthService.checkDb();

    let redisOk = true;
    try {
      await this.redisHealth.checkRedis();
    } catch {
      redisOk = false;
    }

    const bull = await this.healthService.checkBullmq();

    const ready = db.ok && redisOk && bull.ok;

    return {
      success: ready,
      message: ready ? 'Ready' : 'Not ready',
      data: {
        database: db,
        redis: { ok: redisOk },
        bullmq: bull,
      },
    };
  }

  @Get('liveness')
  liveness() {
    return {
      success: true,
      message: 'Alive',
      timestamp: new Date().toISOString(),
    };
  }
}
