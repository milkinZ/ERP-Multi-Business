import { Injectable } from "@nestjs/common";

// BullMQ expects a plain connection object compatible with ioredis.
// This worker package does not need to create a Redis client itself.

@Injectable()
export class RedisService {
  getConnectionOptions(): { host: string; port: number } {
    return {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
    };
  }
}
