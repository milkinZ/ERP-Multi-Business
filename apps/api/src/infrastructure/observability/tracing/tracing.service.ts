import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

import type { ObservabilityConfig } from '../../config/observability.config';

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  traceparent: string;
};

@Injectable()
export class TracingService {
  private readonly logger = new Logger(TracingService.name);
  private readonly enabled: boolean;
  private readonly samplingRate: number;

  constructor(private readonly config: ConfigService) {
    const observability = this.config.get<ObservabilityConfig>('observability');
    this.enabled = observability?.tracing.enabled ?? false;
    this.samplingRate = observability?.tracing.samplingRate ?? 1;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create a new trace context (root span).
   * Returns null when tracing is disabled.
   */
  startTrace(): TraceContext | null {
    if (!this.enabled) return null;

    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const sampled = this.shouldSample();

    return {
      traceId,
      spanId,
      sampled,
      traceparent: this.buildTraceparent(traceId, spanId, sampled),
    };
  }

  /**
   * Continue a trace from an incoming W3C traceparent header.
   * Returns null when tracing is disabled or header is invalid.
   */
  continueTrace(traceparent?: string): TraceContext | null {
    if (!this.enabled) return null;
    if (!traceparent) return this.startTrace();

    const parsed = this.parseTraceparent(traceparent);
    if (!parsed) return this.startTrace();

    const spanId = randomBytes(8).toString('hex');

    return {
      traceId: parsed.traceId,
      spanId,
      parentSpanId: parsed.spanId,
      sampled: parsed.sampled,
      traceparent: this.buildTraceparent(
        parsed.traceId,
        spanId,
        parsed.sampled,
      ),
    };
  }

  /**
   * Create a child span from a parent trace context.
   */
  startChildSpan(parent: TraceContext): TraceContext {
    const spanId = randomBytes(8).toString('hex');
    return {
      traceId: parent.traceId,
      spanId,
      parentSpanId: parent.spanId,
      sampled: parent.sampled,
      traceparent: this.buildTraceparent(
        parent.traceId,
        spanId,
        parent.sampled,
      ),
    };
  }

  private shouldSample(): boolean {
    if (this.samplingRate >= 1) return true;
    if (this.samplingRate <= 0) return false;
    // Deterministic sampling based on a random value.
    return Math.random() <= this.samplingRate;
  }

  private buildTraceparent(
    traceId: string,
    spanId: string,
    sampled: boolean,
  ): string {
    const flags = sampled ? '01' : '00';
    return `00-${traceId}-${spanId}-${flags}`;
  }

  private parseTraceparent(
    traceparent: string,
  ): { traceId: string; spanId: string; sampled: boolean } | null {
    // Format: version-traceid-spanid-flags
    const parts = traceparent.split('-');
    if (parts.length < 4) return null;

    const version = parts[0];
    const traceId = parts[1];
    const spanId = parts[2];
    const flags = parts[3];

    if (version !== '00' && version !== 'ff') return null;
    if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
    if (!/^[0-9a-f]{16}$/.test(spanId)) return null;

    const flagByte = flags.slice(0, 2);
    const sampled = flagByte === '01';

    return { traceId, spanId, sampled };
  }
}
