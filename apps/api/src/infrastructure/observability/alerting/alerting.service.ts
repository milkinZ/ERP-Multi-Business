import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ObservabilityConfig } from '../../config/observability.config';

/**
 * Configurable alerting service.
 *
 * Collects error-rate / response-time / queue-backlog signals and
 * posts a webhook notification when configured thresholds are exceeded.
 * Fully optional: when ALERTING_ENABLED is false, all methods are no-ops.
 */
@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private readonly enabled: boolean;
  private readonly webhookUrl?: string;
  private readonly highErrorRateThreshold: number;
  private readonly highResponseTimeMs: number;
  private readonly queueBacklogThreshold: number;
  private readonly outboxStuckThreshold: number;

  private recentErrors = 0;
  private totalRequests = 0;
  private windowStart = Date.now();
  private readonly windowMs = 60_000;

  constructor(private readonly config: ConfigService) {
    const observability = this.config.get<ObservabilityConfig>('observability');
    this.enabled = observability?.alerting.enabled ?? false;
    this.webhookUrl = observability?.alerting.webhookUrl;
    this.highErrorRateThreshold =
      observability?.alerting.highErrorRateThreshold ?? 0.05;
    this.highResponseTimeMs =
      observability?.alerting.highResponseTimeMs ?? 2000;
    this.queueBacklogThreshold =
      observability?.alerting.queueBacklogThreshold ?? 100;
    this.outboxStuckThreshold =
      observability?.alerting.outboxStuckThreshold ?? 100;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Record a request outcome (success/error) for error-rate tracking. */
  recordRequest(ok: boolean): void {
    this.totalRequests++;
    if (!ok) this.recentErrors++;
    this.maybeEvaluate();
  }

  /** Record an arbitrary error occurrence (e.g. domain event failure). */
  recordError(source: string, detail: string): void {
    if (!this.enabled) return;
    void this.sendAlert({
      level: 'error',
      source,
      message: detail,
    }).catch(() => undefined);
  }

  /** Record a queue backlog signal. */
  recordQueueBacklog(queue: string, waiting: number): void {
    if (!this.enabled) return;
    if (waiting > this.queueBacklogThreshold) {
      void this.sendAlert({
        level: 'warning',
        source: 'queue',
        message: `Queue "${queue}" backlog ${waiting} exceeds threshold ${this.queueBacklogThreshold}`,
      }).catch(() => undefined);
    }
  }

  /** Record an outbox starvation signal. */
  recordOutboxBacklog(outboxCount: number): void {
    if (!this.enabled) return;
    if (outboxCount > this.outboxStuckThreshold) {
      void this.sendAlert({
        level: 'warning',
        source: 'outbox',
        message: `Outbox backlog ${outboxCount} exceeds threshold ${this.outboxStuckThreshold}`,
      }).catch(() => undefined);
    }
  }

  /** Record a slow HTTP response. */
  recordSlowResponse(route: string, durationMs: number): void {
    if (!this.enabled) return;
    if (durationMs > this.highResponseTimeMs) {
      void this.sendAlert({
        level: 'warning',
        source: 'http',
        message: `Slow response on ${route}: ${durationMs}ms (> ${this.highResponseTimeMs}ms)`,
      }).catch(() => undefined);
    }
  }

  private maybeEvaluate(): void {
    if (!this.enabled) return;
    const elapsed = Date.now() - this.windowStart;
    if (elapsed < this.windowMs) return;

    const rate =
      this.totalRequests > 0 ? this.recentErrors / this.totalRequests : 0;
    if (rate > this.highErrorRateThreshold) {
      void this.sendAlert({
        level: 'critical',
        source: 'error-rate',
        message: `Error rate ${(rate * 100).toFixed(2)}% exceeds threshold ${
          this.highErrorRateThreshold * 100
        }%`,
      }).catch(() => undefined);
    }

    // Reset sliding window.
    this.recentErrors = 0;
    this.totalRequests = 0;
    this.windowStart = Date.now();
  }

  private async sendAlert(payload: {
    level: string;
    source: string;
    message: string;
  }): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const body = {
        text: `[${payload.level.toUpperCase()}] [${payload.source}] ${payload.message}`,
      };
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        this.logger.warn(`Alert webhook responded ${response.status}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to send alert: ${err}`);
    }
  }
}
