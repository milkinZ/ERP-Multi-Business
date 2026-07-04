import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { ConfigService } from '@nestjs/config';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

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

  console.log('Registering Swagger...');

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  console.log('Swagger registered at /docs');

  // await app.init();

  // Global response wrapper
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global pipes/filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

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
