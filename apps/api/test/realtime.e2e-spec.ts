import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';

import { AppModule } from '../src/app.module';
import { WebsocketGateway } from '../src/infrastructure/websocket/gateways/websocket.gateway';
import { SocketRedisAdapterProvider } from '../src/infrastructure/websocket/redis/socket-redis-adapter.provider';
import { RedisIoAdapter } from '../src/infrastructure/websocket/redis/redis-io.adapter';

const waitForConnect = (socket: Socket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });

const waitForConnectError = (socket: Socket): Promise<Error> =>
  new Promise((resolve) => {
    socket.once('connect_error', (error: Error) => resolve(error));
  });

const waitForEvent = <T>(socket: Socket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve));

const waitForNoEvent = (socket: Socket, event: string): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), 300);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

describe('Socket.IO realtime boundary', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  const secret = process.env.JWT_SECRET ?? '';

  const tokenFor = (userId: string, tenantId: string, outletId?: string) =>
    jwt.sign({ userId, tenantId, outletId }, secret);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const redisAdapterProvider = moduleFixture.get(SocketRedisAdapterProvider);
    app.useWebSocketAdapter(new RedisIoAdapter(app, redisAdapterProvider));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') {
      throw new Error('Realtime test server did not expose a TCP address');
    }
    url = `http://127.0.0.1:${address.port}/ws`;
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated Socket.IO handshake', async () => {
    const socket = io(url, { transports: ['websocket'], autoConnect: true });
    sockets.push(socket);

    const error = await waitForConnectError(socket);

    expect(error.message).toMatch(/JWT|Unauthorized|Invalid/i);
    expect(socket.connected).toBe(false);
  });

  it('connects authenticated clients and isolates tenant room events', async () => {
    const clientA = io(url, {
      transports: ['websocket'],
      auth: { token: tokenFor('user-a', 'tenant-a', 'outlet-a') },
    });
    const clientB = io(url, {
      transports: ['websocket'],
      auth: { token: tokenFor('user-b', 'tenant-b', 'outlet-b') },
    });
    sockets.push(clientA, clientB);

    await Promise.all([waitForConnect(clientA), waitForConnect(clientB)]);

    const gateway = app.get(WebsocketGateway);
    const receivedByA = waitForEvent<{ tenantId: string }>(
      clientA,
      'tenant-event',
    );
    const notReceivedByB = waitForNoEvent(clientB, 'tenant-event');

    gateway.server.to('tenant:tenant-a').emit('tenant-event', {
      tenantId: 'tenant-a',
      resourceId: 'resource-a',
    });

    await expect(receivedByA).resolves.toEqual({
      tenantId: 'tenant-a',
      resourceId: 'resource-a',
    });
    await expect(notReceivedByB).resolves.toBe(true);
  });
});
