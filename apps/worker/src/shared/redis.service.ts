import { Injectable } from "@nestjs/common";

// BullMQ expects a plain connection object compatible with ioredis.
// This worker package does not need to create a Redis client itself.

export type RedisConnectionOptions = {
  host: string;
  port: number;
  db?: number;
  username?: string;
  password?: string;
  tls?: { rejectUnauthorized?: boolean };
};

@Injectable()
export class RedisService {
  getConnectionOptions(): RedisConnectionOptions {
    const redisUrl = process.env.REDIS_URL ?? process.env.REDIS_URI;
    if (redisUrl) {
      const parsed = new URL(redisUrl);
      return {
        host: parsed.hostname,
        port: Number(parsed.port || 6379),
        db:
          parsed.pathname && parsed.pathname !== "/"
            ? Number(parsed.pathname.slice(1))
            : undefined,
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        tls:
          parsed.protocol === "rediss:"
            ? { rejectUnauthorized: false }
            : undefined,
      };
    }

    return {
      host: process.env.REDIS_HOST ?? "127.0.0.1",
      port: Number(process.env.REDIS_PORT ?? 6379),
      db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : undefined,
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      tls:
        process.env.REDIS_TLS === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    };
  }
}
