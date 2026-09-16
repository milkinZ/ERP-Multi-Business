import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../src/app.module';
import { SocketRedisAdapterProvider } from '../src/infrastructure/websocket/redis/socket-redis-adapter.provider';
import { RedisIoAdapter } from '../src/infrastructure/websocket/redis/redis-io.adapter';

describe('OpenAPI contract', () => {
  let app: INestApplication;

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

  it('publishes authenticated critical routes and bearer security metadata', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ERP Multi-Business API')
        .setVersion('1')
        .addBearerAuth({ type: 'http', scheme: 'bearer' })
        .build(),
    );

    expect(document.openapi).toBe('3.0.0');
    expect(document.components?.securitySchemes).toEqual(
      expect.objectContaining({
        bearer: expect.objectContaining({ type: 'http', scheme: 'bearer' }),
      }),
    );
    expect(document.paths['/products']).toBeDefined();
    expect(document.paths['/payments/pay']).toBeDefined();
    expect(document.paths['/purchase-orders']).toBeDefined();
    expect(document.paths['/health/liveness']).toBeDefined();
  });
});
