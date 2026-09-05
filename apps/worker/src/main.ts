import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Initialize OpenTelemetry in worker process if configured (defensive)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    const samplingEnv = process.env.TRACE_SAMPLING_RATE;
    const sampling = samplingEnv ? Number(samplingEnv) : undefined;
    const exporterUrl = process.env.TRACE_EXPORTER;
    const traceExporter = exporterUrl ? new OTLPTraceExporter({ url: exporterUrl }) : undefined;

    const sdkConfig: any = { traceExporter };
    if (typeof sampling === 'number' && !Number.isNaN(sampling)) {
      try {
        const { TraceIdRatioBased } = require('@opentelemetry/core');
        const { ParentBasedSampler } = require('@opentelemetry/sdk-trace-base');
        sdkConfig.sampler = new ParentBasedSampler({ root: new TraceIdRatioBased(sampling) });
      } catch {
        // ignore
      }
    }

    const instr = [];
    try {
      // HTTP instrumentation
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
      instr.push(new HttpInstrumentation());
    } catch {
      // ignore
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { IORedisInstrumentation } = require('@opentelemetry/instrumentation-ioredis');
      instr.push(new IORedisInstrumentation());
    } catch {
      // ignore
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BullMQInstrumentation } = require('@opentelemetry/instrumentation-bullmq');
      instr.push(new BullMQInstrumentation());
    } catch {
      // ignore
    }

    sdkConfig.instrumentations = instr;
    try {
      const sdk = new NodeSDK(sdkConfig);
      void sdk.start();
      // ensure graceful shutdown
      process.on('exit', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
        void (sdk as any)?.shutdown?.();
      });
    } catch {
      // ignore
    }
  } catch {
    // OTEL not available — continue
  }
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });

  // Workers must never expose HTTP endpoints
  await app.init();
}

void bootstrap();
