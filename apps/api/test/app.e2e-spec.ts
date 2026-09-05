import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { SocketRedisAdapterProvider } from './../src/infrastructure/websocket/redis/socket-redis-adapter.provider';
import { RedisIoAdapter } from './../src/infrastructure/websocket/redis/redis-io.adapter';

describe('AppController (e2e)', () => {
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

  it('/health/liveness (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/liveness')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            success: true,
            message: 'Alive',
            timestamp: expect.any(String),
          }),
        );
      });
  });

  it('rejects unauthenticated access to the authenticated user endpoint', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects unauthenticated access to a tenant-scoped resource', () => {
    return request(app.getHttpServer()).get('/products').expect(401);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
