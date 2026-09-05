import { registerAs } from '@nestjs/config';

export type ObservabilityConfig = {
  metrics: {
    enabled: boolean;
    path: string;
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
    exporter: string;
  };
  sentry: {
    dsn?: string;
    environment?: string;
    release?: string;
    tracesSampleRate: number;
  };
  grafana: {
    url?: string;
  };
  alerting: {
    enabled: boolean;
    webhookUrl?: string;
    highErrorRateThreshold: number;
    highResponseTimeMs: number;
    queueBacklogThreshold: number;
    outboxStuckThreshold: number;
  };
  logging: {
    level: string;
    retentionDurationDays: number;
    rotationPeriod: string;
    compression: string;
    logPath?: string;
  };
};

export const observabilityConfig = registerAs(
  'observability',
  (): ObservabilityConfig => {
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    // Environment-driven sampling (no hardcoded values for production semantics).
    const samplingRate = (() => {
      const raw = process.env.TRACE_SAMPLING_RATE;
      if (raw !== undefined && raw !== '') {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
      // Defaults by environment.
      if (nodeEnv === 'production') return 0.1;
      if (nodeEnv === 'staging') return 1;
      return 1;
    })();

    return {
      metrics: {
        enabled: process.env.METRICS_ENABLED !== 'false',
        path: process.env.METRICS_PATH ?? '/metrics',
      },
      tracing: {
        enabled: process.env.TRACE_ENABLED === 'true',
        samplingRate,
        exporter: process.env.TRACE_EXPORTER ?? 'console',
      },
      sentry: {
        dsn: process.env.SENTRY_DSN || undefined,
        environment:
          process.env.SENTRY_ENVIRONMENT ??
          (nodeEnv === 'production' ? 'production' : nodeEnv),
        release: process.env.SENTRY_RELEASE || process.env.APP_VERSION,
        tracesSampleRate: nodeEnv === 'production' ? samplingRate : 1,
      },
      grafana: {
        url: process.env.GRAFANA_URL || undefined,
      },
      alerting: {
        enabled: process.env.ALERTING_ENABLED === 'true',
        webhookUrl: process.env.ALERT_WEBHOOK_URL || undefined,
        highErrorRateThreshold: Number(
          process.env.ALERT_HIGH_ERROR_RATE_THRESHOLD ?? 0.05,
        ),
        highResponseTimeMs: Number(
          process.env.ALERT_HIGH_RESPONSE_TIME_MS ?? 2000,
        ),
        queueBacklogThreshold: Number(
          process.env.ALERT_QUEUE_BACKLOG_THRESHOLD ?? 100,
        ),
        outboxStuckThreshold: Number(
          process.env.ALERT_OUTBOX_STUCK_THRESHOLD ?? 100,
        ),
      },
      logging: {
        level: process.env.LOG_LEVEL ?? 'info',
        retentionDurationDays: Number(
          process.env.LOG_RETENTION_DURATION_DAYS ?? 30,
        ),
        rotationPeriod: process.env.LOG_ROTATION_PERIOD ?? 'daily',
        compression: process.env.LOG_COMPRESSION ?? 'gzip',
        logPath: process.env.LOG_PATH || undefined,
      },
    };
  },
);
