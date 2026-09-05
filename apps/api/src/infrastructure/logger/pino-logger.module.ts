import { Module } from '@nestjs/common';
import { LoggerModule as NestLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream';
import { promisify } from 'util';
// import { randomUUID } from 'crypto';
import { requestContext } from '../../core/request-context/request-context';

const pipe = promisify(pipeline);

function ensureLogPath(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

function compressFile(filePath: string): Promise<void> {
  const gzipPath = `${filePath}.gz`;
  const source = fs.createReadStream(filePath);
  const dest = fs.createWriteStream(gzipPath);
  const gzip = zlib.createGzip();
  return pipe(source, gzip, dest)
    .then(() => fs.promises.unlink(filePath))
    .catch(() => undefined);
}

function cleanupOldLogs(
  dir: string,
  prefix: string,
  retentionDays: number,
  compression: string | undefined,
) {
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith(prefix)) continue;
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        const ageDays = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > retentionDays) {
          fs.unlinkSync(full);
          continue;
        }

        // Compress older files (older than 1 day) if requested and not already compressed
        if (compression === 'gzip' && ageDays > 1 && !full.endsWith('.gz')) {
          void compressFile(full);
        }
      } catch {
        // ignore per non-blocking requirement
      }
    }
  } catch {
    // ignore
  }
}

@Module({
  imports: [
    ConfigModule,
    NestLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const level = config.get<string>('LOG_LEVEL') ?? 'info';
        const logPath = config.get<string>('LOG_PATH') ?? process.env.LOG_PATH;
        const retention = Number(
          config.get<number>('LOG_RETENTION_DURATION_DAYS') ?? 30,
        );
        // rotation period currently not used by in-process rotator
        const compression = config.get<string>('LOG_COMPRESSION') ?? 'gzip';

        let stream: fs.WriteStream | undefined;

        if (process.env.NODE_ENV === 'production' && logPath) {
          try {
            ensureLogPath(logPath);
            const today = new Date();
            const dateStr = today.toISOString().slice(0, 10);
            const filename = `erp-api-${dateStr}.log`;
            const full = path.join(logPath, filename);
            stream = fs.createWriteStream(full, { flags: 'a' });
            // Perform cleanup asynchronously
            void cleanupOldLogs(logPath, 'erp-api-', retention, compression);
          } catch {
            stream = undefined;
          }
        }

        return {
          pinoHttp: {
            level,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers.x-access-token',
                'req.headers.x-refresh-token',
                'req.body.password',
                'req.body.token',
                'req.body.refreshToken',
                'req.body.accessToken',
                'req.body.secret',
              ],
              censor: '[REDACTED]',
            },
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
            ...(stream ? { stream } : {}),
          },
        };
      },
    }),
  ],
  exports: [],
})
export class LoggerModule {}
