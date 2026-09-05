/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ObservabilityConfig } from '../../config/observability.config';

/**
 * Defensive OpenTelemetry initializer.
 * Uses dynamic require so the app can run without OTEL packages installed.
 */
@Injectable()
export class OpenTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenTelemetryService.name);
  private sdk: unknown = null;
  private enabled = false;

  constructor(private readonly config: ConfigService) {
    const observability = this.config.get<ObservabilityConfig>('observability');
    this.enabled = !!observability?.tracing?.enabled;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('OpenTelemetry disabled by config');
      return;
    }

    try {
      // Dynamic imports to avoid hard dependency at compile time.

      const { NodeSDK } = require('@opentelemetry/sdk-node');

      const {
        OTLPTraceExporter,
      } = require('@opentelemetry/exporter-trace-otlp-http');

      const {
        HttpInstrumentation,
      } = require('@opentelemetry/instrumentation-http');

      const {
        PgInstrumentation,
      } = require('@opentelemetry/instrumentation-pg');

      const {
        IORedisInstrumentation,
      } = require('@opentelemetry/instrumentation-ioredis');

      const observability =
        this.config.get<ObservabilityConfig>('observability');
      const exporterUrl =
        observability?.tracing?.exporter ?? process.env.TRACE_EXPORTER;

      const traceExporter =
        exporterUrl && exporterUrl !== 'console'
          ? new OTLPTraceExporter({ url: exporterUrl })
          : undefined;

      // Configure sampler from env (0.0 - 1.0). Default: 1.0 in development, else from config.
      const samplingEnv =
        process.env.TRACE_SAMPLING_RATE ??
        String(observability?.tracing?.samplingRate ?? '');
      const sampling = samplingEnv ? Number(samplingEnv) : undefined;

      // Try to create optional samplers if sampling configured
      const sdkConfig: any = { traceExporter };

      if (typeof sampling === 'number' && !Number.isNaN(sampling)) {
        try {
          // ParentBased(TraceIdRatioBased(sampling))

          const { TraceIdRatioBased } = require('@opentelemetry/core');

          const {
            ParentBasedSampler,
          } = require('@opentelemetry/sdk-trace-base');
          const rootSampler = new TraceIdRatioBased(sampling);
          const sampler = new ParentBasedSampler({ root: rootSampler });
          sdkConfig.sampler = sampler;
        } catch {
          // ignore sampler failures
        }
      }

      const instrumentations = [
        new HttpInstrumentation(),
        new PgInstrumentation(),
        new IORedisInstrumentation(),
      ];

      // Add bullmq instrumentation if available
      try {
        const {
          BullMQInstrumentation,
        } = require('@opentelemetry/instrumentation-bullmq');
        instrumentations.push(new BullMQInstrumentation());
      } catch {
        // ignore if not installed
      }

      sdkConfig.instrumentations = instrumentations;

      const sdk = new NodeSDK(sdkConfig);

      await sdk.start();
      this.sdk = sdk;
      this.logger.log('OpenTelemetry SDK started');
    } catch (err) {
      this.logger.warn(
        `OpenTelemetry initialization failed or packages missing: ${String(err)}`,
      );
      // continue without OTEL (non-blocking)
      this.sdk = null;
    }
  }

  async onModuleDestroy() {
    if (!this.sdk) return;
    try {
      // sdk is typed as unknown due to dynamic require; call shutdown defensively

      await (this.sdk as any)?.shutdown?.();
      this.logger.log('OpenTelemetry SDK shut down');
    } catch (err) {
      this.logger.warn(`OpenTelemetry shutdown failed: ${String(err)}`);
    }
  }

  isEnabled(): boolean {
    return !!this.sdk;
  }
}

export default OpenTelemetryService;
