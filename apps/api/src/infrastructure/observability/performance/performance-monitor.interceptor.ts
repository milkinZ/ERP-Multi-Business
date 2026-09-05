import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import type { Response } from 'express';

import type { ObservabilityConfig } from '../../config/observability.config';

import { MetricsService } from '../metrics/metrics.service';
import { TracingService, type TraceContext } from '../tracing/tracing.service';
import { AlertingService } from '../alerting/alerting.service';

interface TraceableRequest {
  method: string;
  route?: { path?: string };
  originalUrl?: string;
  traceContext?: TraceContext;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Performance-monitoring interceptor.
 *
 * Tracks HTTP request duration and error counts, attaches a trace context,
 * and signals slow responses to the alerting service.
 */
@Injectable()
export class PerformanceMonitorInterceptor implements NestInterceptor {
  private readonly slowResponseMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly tracing: TracingService,
    private readonly alerting: AlertingService,
  ) {
    const observability = this.config.get<ObservabilityConfig>('observability');
    this.slowResponseMs = observability?.alerting.highResponseTimeMs ?? 2000;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<TraceableRequest>();

    const method = request.method ?? 'UNKNOWN';
    const route =
      request.route?.path ?? request.originalUrl?.split('?')[0] ?? 'unknown';

    // Continue or start a trace from the incoming traceparent header.
    const rawTraceparent = request.headers['traceparent'];
    const traceparent = Array.isArray(rawTraceparent)
      ? rawTraceparent[0]
      : rawTraceparent;
    const traceContext = this.tracing.continueTrace(traceparent);
    if (traceContext) {
      request.traceContext = traceContext;
    }

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;

          const response = http.getResponse<Response | undefined>();

          const statusCode =
            typeof response?.statusCode === 'number'
              ? response.statusCode
              : 200;
          const status = `${Math.floor(statusCode / 100)}xx`;
          this.metrics.httpRequestTotal.inc({ method, route, status });
          this.metrics.httpRequestDuration.observe(
            { method, route, status },
            durationMs / 1000,
          );
          this.alerting.recordRequest(true);
          if (durationMs > this.slowResponseMs) {
            this.alerting.recordSlowResponse(route, durationMs);
          }
        },
        error: () => {
          const durationMs = Date.now() - start;

          const response = http.getResponse<Response | undefined>();

          const statusCode =
            typeof response?.statusCode === 'number'
              ? response.statusCode
              : 500;
          const status = `${Math.floor(statusCode / 100)}xx`;
          this.metrics.httpRequestTotal.inc({ method, route, status });
          this.metrics.httpRequestErrors.inc({ method, route, status });
          this.metrics.httpRequestDuration.observe(
            { method, route, status },
            durationMs / 1000,
          );
          this.alerting.recordRequest(false);
        },
      }),
    );
  }
}
