import { Module } from '@nestjs/common';
import { LoggerModule as NestLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
// import { randomUUID } from 'crypto';
import { requestContext } from '../../core/request-context/request-context';

@Module({
  imports: [
    ConfigModule,
    NestLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('LOG_LEVEL') ?? 'info';

        return {
          pinoHttp: {
            level,
            // genReqId: () => randomUUID(),
            transport:
              process.env.NODE_ENV !== 'production'
                ? {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                    },
                  }
                : undefined,
            customProps: () => {
              const ctx = requestContext.get();
              return {
                requestId: ctx?.requestId,
                correlationId: ctx?.correlationId,
                tenantId: ctx?.tenantId,
                userId: ctx?.userId,
                outletId: ctx?.outletId,
              };
            },
          },
        };
      },
    }),
  ],
  exports: [],
})
export class LoggerModule {}
