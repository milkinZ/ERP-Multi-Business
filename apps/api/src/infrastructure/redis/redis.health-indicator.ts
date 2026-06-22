import { Injectable } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';

import { RedisService } from './redis.service';

@Injectable()
export class HealthCheck {
  constructor(
    private readonly redisService: RedisService,
    private readonly health: HealthCheckService,
  ) {}

  async checkRedis(): Promise<void> {
    const client = this.redisService.getClient();
    await client.ping();
  }
}
