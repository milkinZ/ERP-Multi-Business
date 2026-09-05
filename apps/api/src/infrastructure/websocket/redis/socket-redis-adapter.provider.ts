import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class SocketRedisAdapterProvider {
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(private readonly redisService: RedisService) {}

  createClients(): {
    pubClient: Redis;
    subClient: Redis;
  } {
    this.pubClient = this.redisService.redis.duplicate();
    this.subClient = this.redisService.redis.duplicate();

    return {
      pubClient: this.pubClient,
      subClient: this.subClient,
    };
  }

  async close(): Promise<void> {
    const clients = [this.pubClient, this.subClient].filter(
      (client): client is Redis => !!client,
    );

    this.pubClient = undefined;
    this.subClient = undefined;

    for (const client of clients) {
      try {
        if (client.status === 'ready' || client.status === 'connecting') {
          await client.quit();
        } else {
          client.disconnect();
        }
      } catch (err) {
        console.error(
          '[SocketRedisAdapterProvider] close error:',
          err instanceof Error ? err.message : err,
        );

        client.disconnect();
      }
    }
  }
}
