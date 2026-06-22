import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
// import * as IORedis from 'ioredis';

import { ConfigService } from '@nestjs/config';

import { REDIS_PROVIDER } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_PROVIDER)
    public readonly redis: Redis,
  ) {}

  getClient() {
    return this.redis;
  }

  getBullmqConnectionOptions(): { host: string; port: number } {
    const host = this.configService.get<string>('redis.host');
    const port = this.configService.get<number>('redis.port');

    // Fallbacks in case env uses redis.url only
    const url = this.configService.get<string>('redis.url');
    if (host && typeof port === 'number') {
      return { host, port };
    }

    // Very small url parsing: redis://host:port
    if (url) {
      try {
        const u = new URL(url);
        return { host: u.hostname, port: Number(u.port) || 6379 };
      } catch {
        // ignore
      }
    }

    return {
      host: this.configService.get<string>('REDIS_HOST') ?? '127.0.0.1',
      port: Number(this.configService.get<number>('REDIS_PORT') ?? 6379),
    };
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
