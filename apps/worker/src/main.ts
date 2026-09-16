/* Optional OpenTelemetry packages are loaded defensively at runtime. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-require-imports */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Initialize OpenTelemetry in worker process if configured (defensive)
  try {
    const { NodeSDK } = require("@opentelemetry/sdk-node");
    const {
      OTLPTraceExporter,
    } = require("@opentelemetry/exporter-trace-otlp-http");
    const samplingEnv = process.env.TRACE_SAMPLING_RATE;
    const sampling = samplingEnv ? Number(samplingEnv) : undefined;
    const exporterUrl = process.env.TRACE_EXPORTER;
    const traceExporter = exporterUrl
      ? new OTLPTraceExporter({ url: exporterUrl })
      : undefined;

    const sdkConfig: any = { traceExporter };
    if (typeof sampling === "number" && !Number.isNaN(sampling)) {
      try {
        const { TraceIdRatioBased } = require("@opentelemetry/core");
        const { ParentBasedSampler } = require("@opentelemetry/sdk-trace-base");
        sdkConfig.sampler = new ParentBasedSampler({
          root: new TraceIdRatioBased(sampling),
        });
      } catch {
        // ignore
      }
    }

    const instr = [];
    try {
      const {
        HttpInstrumentation,
      } = require("@opentelemetry/instrumentation-http");
      instr.push(new HttpInstrumentation());
    } catch {
      // ignore
    }

    try {
      const {
        IORedisInstrumentation,
      } = require("@opentelemetry/instrumentation-ioredis");
      instr.push(new IORedisInstrumentation());
    } catch {
      // ignore
    }

    try {
      const {
        BullMQInstrumentation,
      } = require("@opentelemetry/instrumentation-bullmq");
      instr.push(new BullMQInstrumentation());
    } catch {
      // ignore
    }

    sdkConfig.instrumentations = instr;
    try {
      const sdk = new NodeSDK(sdkConfig);
      void sdk.start();
      process.on("exit", () => {
        void sdk?.shutdown?.();
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

  app.enableShutdownHooks();
  await app.init();

  const shutdown = () => {
    void app.close().finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    shutdown();
  });
  process.on("SIGTERM", () => {
    shutdown();
  });
}

void bootstrap();
