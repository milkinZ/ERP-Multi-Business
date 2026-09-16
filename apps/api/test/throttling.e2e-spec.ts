import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { SocketRedisAdapterProvider } from '../src/infrastructure/websocket/redis/socket-redis-adapter.provider';
import { RedisIoAdapter } from '../src/infrastructure/websocket/redis/redis-io.adapter';

describe('HTTP throttling', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    const redisAdapterProvider = moduleFixture.get(SocketRedisAdapterProvider);
    app.useWebSocketAdapter(new RedisIoAdapter(app, redisAdapterProvider));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows the configured request window and rejects the next request', async () => {
    const responses: Array<{ status: number }> = [];
    for (let index = 0; index < 121; index += 1) {
      responses.push(await request(app.getHttpServer()).get('/health/liveness'));
    }

    expect(responses.slice(0, 120).every((response) => response.status === 200)).toBe(true);
    expect(responses.slice(120).some((response) => response.status === 429)).toBe(true);
  }, 30000);
});
