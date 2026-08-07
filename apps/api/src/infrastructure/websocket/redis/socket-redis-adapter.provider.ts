import { Injectable } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service';

@Injectable()
export class SocketRedisAdapterProvider {
  constructor(private readonly redisService: RedisService) {}

  async createAdapter(): Promise<{
    createAdapter: (pubClient: unknown, subClient: unknown) => unknown;
    pubClient: unknown;
    subClient: unknown;
  }> {
    const { createAdapter } = await import('@socket.io/redis-adapter');

    // RedisService uses ioredis. The adapter can work with compatible clients.
    const pubClient = this.redisService.getClient();
    const subClient = pubClient.duplicate();

    return { createAdapter, pubClient, subClient };
  }
}
