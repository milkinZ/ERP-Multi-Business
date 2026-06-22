import { Module } from '@nestjs/common';
import { LoggerModule as NestLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    NestLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('LOG_LEVEL') ?? 'info';

        // Keep this configuration minimal and typing-compatible with nestjs-pino.
        // Detailed request/tenant tracking will be added in Phase 1 using requestContext + pinoHttp hooks
        // once typings are aligned.
        return {
          pinoHttp: {
            level,
            genReqId: () => 'reqid',
          },
        };
      },
    }),
  ],
  exports: [NestLoggerModule],
})
export class LoggerModule {}
