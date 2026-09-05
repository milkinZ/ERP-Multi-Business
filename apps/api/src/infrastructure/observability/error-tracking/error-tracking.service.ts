import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';

import type { ObservabilityConfig } from '../../config/observability.config';

import { maskForLogging } from '../security-masking';

/**
 * Optional Sentry error-tracking service.
 *
 * When SENTRY_DSN is not set, all methods are no-ops so the application
 * works seamlessly in local / CI environments without Sentry.
 */
@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger(ErrorTrackingService.name);
  private enabled = false;

  constructor(private readonly config: ConfigService) {
    const observability = this.config.get<ObservabilityConfig>('observability');
    const dsn = observability?.sentry.dsn;
    const environment = observability?.sentry.environment;
    const release = observability?.sentry.release;
    const tracesSampleRate = observability?.sentry.tracesSampleRate ?? 1;

    if (!dsn) {
      this.logger.log('Sentry disabled (no SENTRY_DSN configured)');
      return;
    }

    Sentry.init({
      dsn,
      environment,
      release,
      tracesSampleRate,
      // Do not send request bodies - they may contain PII.
      sendDefaultPii: false,
    });
    this.enabled = true;
    this.logger.log('Sentry error tracking initialized');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  captureException(error: Error, context?: Record<string, unknown>): void {
    if (!this.enabled) return;
    try {
      const tags = this.toTags(context?.tags);
      const extra = maskForLogging(context?.extra ?? context) as Record<
        string,
        unknown
      >;
      Sentry.captureException(error, {
        tags,
        extra,
      });
    } catch {
      // Ignore - observability must never crash the app.
    }
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'error'): void {
    if (!this.enabled) return;
    try {
      Sentry.captureMessage(message, { level });
    } catch {
      // Ignore.
    }
  }

  /** Convert an arbitrary tags value into a Sentry-compatible tag map. */
  private toTags(
    value: unknown,
  ): { [key: string]: string | number | boolean } | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const raw = value as Record<string, unknown>;
    const result: { [key: string]: string | number | boolean } = {};
    for (const key of Object.keys(raw)) {
      const v = raw[key];
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        result[key] = v;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  setUserContext(userId?: string, tenantId?: string): void {
    if (!this.enabled || !userId) return;
    try {
      Sentry.withScope((scope) => {
        if (tenantId) scope.setExtra('tenantId', tenantId);
        scope.setExtra('userId', userId);
      });
    } catch {
      // Ignore.
    }
  }
}
