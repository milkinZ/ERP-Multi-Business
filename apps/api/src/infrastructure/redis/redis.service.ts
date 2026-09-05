import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis, Command } from 'ioredis';

import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../observability/metrics/metrics.service';

import { REDIS_PROVIDER } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    private readonly configService: ConfigService,
    @Inject(REDIS_PROVIDER)
    public readonly redis: Redis,
    private readonly metrics?: MetricsService,
  ) {
    this.attachMetrics();
  }

  private clientProxy?: Redis;

  getClient() {
    if (this.clientProxy) return this.clientProxy;
    if (!this.metrics) return this.redis;

    this.clientProxy = new Proxy(this.redis, {
      get: (target, prop, receiver): unknown => {
        const value: unknown = Reflect.get(target, prop, receiver) as unknown;

        if (prop === 'get' && typeof value === 'function') {
          const getFn = value as (...args: unknown[]) => Promise<unknown>;
          return async (...args: unknown[]): Promise<unknown> => {
            const start = Date.now();
            try {
              const result = await (getFn.apply(
                target,
                args,
              ) as Promise<unknown>);
              try {
                const isHit = result !== null && result !== undefined;
                if (isHit) {
                  this.metrics?.cacheHitsTotal.inc({ backend: 'redis' }, 1);
                } else {
                  this.metrics?.cacheMissesTotal.inc({ backend: 'redis' }, 1);
                }
              } catch {
                // ignore
              }
              return result;
            } catch (err) {
              try {
                this.metrics?.redisCommandsTotal.inc(
                  {
                    command: 'get',
                    status: 'failure',
                  },
                  1,
                );
              } catch {
                // ignore
              }
              throw err;
            } finally {
              try {
                this.metrics?.redisCommandDuration?.observe(
                  { command: 'get' },
                  (Date.now() - start) / 1000,
                );
              } catch {
                // ignore
              }
            }
          };
        }
        return typeof value === 'function'
          ? ((value as (...args: unknown[]) => unknown).bind(target) as unknown)
          : value;
      },
    });

    return this.clientProxy;
  }

  private attachMetrics() {
    if (!this.metrics || !this.redis || typeof this.redis.on !== 'function') {
      return;
    }

    try {
      this.redis.on('command', (command: Command) => {
        const name = command.name ?? 'unknown';
        try {
          this.metrics?.redisCommandsTotal.inc(
            { command: name, status: 'success' },
            1,
          );
        } catch {
          // ignore
        }

        const start = Date.now();
        const commandLike = command as unknown as {
          promise?: Promise<unknown>;
        };
        const promise = commandLike.promise;
        if (promise && typeof promise.then === 'function') {
          promise
            .then(() => {
              try {
                this.metrics?.redisCommandDuration.observe(
                  { command: name },
                  (Date.now() - start) / 1000,
                );
              } catch {
                // ignore
              }
            })
            .catch(() => {
              try {
                this.metrics?.redisCommandsTotal.inc(
                  { command: name, status: 'failure' },
                  1,
                );
              } catch {
                // ignore
              }
            });
        }
      });
    } catch {
      // ignore if event cannot be attached
    }
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

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (err) {
      console.error(
        '[RedisService] quit error:',
        err instanceof Error ? err.message : err,
      );
    }
  }
}
