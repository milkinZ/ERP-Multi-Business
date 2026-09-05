import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';

import { SocketRedisAdapterProvider } from './socket-redis-adapter.provider';

export class RedisIoAdapter extends IoAdapter {
  private server?: Server;
  private closing = false;
  private closePromise?: Promise<void>;

  constructor(
    app: INestApplicationContext,
    private readonly redisAdapterProvider: SocketRedisAdapterProvider,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;

    this.server = server;

    const { pubClient, subClient } = this.redisAdapterProvider.createClients();

    pubClient.on('error', (err) => {
      console.error('[RedisIoAdapter] PUB ERROR:', err);
    });

    subClient.on('error', (err) => {
      console.error('[RedisIoAdapter] SUB ERROR:', err);
    });

    const adapter = createAdapter(pubClient, subClient);

    server.adapter(adapter);

    return server;
  }

  override async close(): Promise<void> {
    // Nest bisa memanggil close() lebih dari sekali
    if (this.closePromise) {
      return this.closePromise;
    }

    this.closePromise = this.performClose();

    return this.closePromise;
  }

  private async performClose(): Promise<void> {
    if (this.closing) {
      return;
    }

    this.closing = true;

    try {
      // Gunakan ROOT Socket.IO server yang dibuat di createIOServer().
      const rootServer = this.server;

      if (rootServer) {
        await new Promise<void>((resolve) => {
          void rootServer.close(() => {
            resolve();
          });
        });
      }
    } finally {
      // Setelah Socket.IO selesai, baru tutup Redis PUB/SUB.
      await this.redisAdapterProvider.close();

      this.server = undefined;
    }
  }
}
