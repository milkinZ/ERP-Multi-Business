import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { ErrorTrackingService } from './infrastructure/observability/error-tracking/error-tracking.service';
import { ConfigService } from '@nestjs/config';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { MetricsService } from './infrastructure/observability/metrics/metrics.service';
import { PerformanceMonitorInterceptor } from './infrastructure/observability/performance/performance-monitor.interceptor';
import type { Request, Response, NextFunction } from 'express';
import { RedisIoAdapter } from './infrastructure/websocket/redis/redis-io.adapter';
import { SocketRedisAdapterProvider } from './infrastructure/websocket/redis/socket-redis-adapter.provider';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const redisAdapterProvider = app.get(SocketRedisAdapterProvider);

  app.useWebSocketAdapter(new RedisIoAdapter(app, redisAdapterProvider));

  const config = app.get(ConfigService);

  //Pino-Logger
  app.useLogger(app.get(Logger));

  //Cookie parser
  app.use(cookieParser());

  // Security
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000',
    credentials: true,
  });

  // Helmet (runtime security headers)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP Multi-Business API')
    .setDescription('Production-grade ERP SaaS backend')
    .setVersion(config.get<string>('APP_VERSION') ?? '1')
    .addBearerAuth({ type: 'http', scheme: 'bearer' })
    .build();

  app.get(Logger).log('Registering Swagger...');
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.get(Logger).log('Swagger registered at /docs');

  // await app.init();

  // Global response wrapper and monitoring
  app.useGlobalInterceptors(
    app.get(PerformanceMonitorInterceptor),
    new ResponseInterceptor(),
  );

  // Expose metrics on configured path for compatibility and dynamic configuration.
  const metricsService = app.get(MetricsService);
  const metricsPath =
    config.get<string>('observability.metrics.path') ?? '/metrics';
  if (metricsService.isEnabled()) {
    app.use(
      metricsPath,
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const body = await metricsService.getMetrics();
          res.setHeader('Content-Type', metricsService.getContentType());
          res.send(body);
        } catch (err) {
          next(err);
        }
      },
    );
  }

  // Global pipes/filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Use DI-resolved HttpExceptionFilter so it can access observability services.
  app.useGlobalFilters(new HttpExceptionFilter(app.get(ErrorTrackingService)));

  // API versioning
  // Ensure header-based versioning to satisfy Nest TS types.
  app.enableVersioning({
    type: 1,
    header: 'x-api-version',
  });

  // const port = config.get<number>('PORT') ?? 3000;
  const port = 3000;
  await app.listen(port, '127.0.0.1');
}
void bootstrap();
