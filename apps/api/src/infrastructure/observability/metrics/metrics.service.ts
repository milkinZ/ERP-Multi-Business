import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

import type { ObservabilityConfig } from '../../config/observability.config';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();
  private readonly enabled: boolean;
  private readonly path: string;

  // HTTP metrics
  readonly httpRequestDuration: Histogram<string>;
  readonly httpRequestTotal: Counter<string>;
  readonly httpRequestErrors: Counter<string>;

  // Application metrics
  readonly activeConnections: Gauge<string>;
  readonly outboxBacklog: Gauge<string>;
  readonly queueJobsCompleted: Counter<string>;
  readonly queueJobsFailed: Counter<string>;
  readonly queueJobsWaiting: Gauge<string>;
  readonly queueJobsActive: Gauge<string>;
  readonly queueJobsDelayed: Gauge<string>;
  readonly queueJobsStalled: Gauge<string>;
  readonly queueJobsRetried: Counter<string>;
  readonly queueJobDuration: Histogram<string>;
  readonly queueJobQueueLatency: Histogram<string>;
  readonly queueJobsDeadLettered: Counter<string>;
  readonly domainEventsPublished: Counter<string>;
  readonly domainEventsProcessed: Counter<string>;
  readonly domainEventsSucceeded: Counter<string>;
  readonly domainEventsFailed: Counter<string>;
  readonly websocketConnections: Gauge<string>;
  readonly websocketDisconnects: Counter<string>;
  readonly websocketEventsEmitted: Counter<string>;
  readonly websocketBroadcastLatency: Histogram<string>;
  readonly websocketBroadcastFailures: Counter<string>;
  readonly aiIntegrationCalls: Counter<string>;

  // Database metrics
  readonly databaseQueriesTotal: Counter<string>;
  readonly databaseQueryDuration: Histogram<string>;

  // Redis metrics
  readonly redisCommandsTotal: Counter<string>;
  readonly redisCommandDuration: Histogram<string>;

  // Cache metrics
  readonly cacheHitsTotal: Counter<string>;
  readonly cacheMissesTotal: Counter<string>;

  constructor(private readonly config: ConfigService) {
    const observability = this.config.get<ObservabilityConfig>('observability');
    this.enabled = observability?.metrics.enabled ?? true;
    this.path = observability?.metrics.path ?? '/metrics';

    this.registry.setDefaultLabels({
      app: 'erp-api',
      service: 'api',
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestErrors = new Counter({
      name: 'http_request_errors_total',
      help: 'Total number of HTTP request errors',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.outboxBacklog = new Gauge({
      name: 'outbox_backlog',
      help: 'Number of pending outbox events',
      registers: [this.registry],
    });

    this.queueJobsCompleted = new Counter({
      name: 'queue_jobs_completed_total',
      help: 'Total number of queue jobs completed',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobsFailed = new Counter({
      name: 'queue_jobs_failed_total',
      help: 'Total number of queue jobs failed',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobsRetried = new Counter({
      name: 'queue_jobs_retried_total',
      help: 'Total number of queue jobs retried',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobDuration = new Histogram({
      name: 'queue_job_duration_seconds',
      help: 'Job processing duration in seconds',
      labelNames: ['queue', 'jobName'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.registry],
    });

    this.queueJobQueueLatency = new Histogram({
      name: 'queue_job_queue_latency_seconds',
      help: 'Time between enqueue and job start in seconds',
      labelNames: ['queue', 'jobName'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });

    this.queueJobsDeadLettered = new Counter({
      name: 'queue_jobs_dead_lettered_total',
      help: 'Total number of jobs moved to DLQ',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobsWaiting = new Gauge({
      name: 'queue_jobs_waiting',
      help: 'Number of waiting jobs per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobsActive = new Gauge({
      name: 'queue_jobs_active',
      help: 'Number of active jobs per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobsDelayed = new Gauge({
      name: 'queue_jobs_delayed',
      help: 'Number of delayed jobs per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.queueJobsStalled = new Gauge({
      name: 'queue_jobs_stalled',
      help: 'Number of stalled jobs per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.domainEventsPublished = new Counter({
      name: 'domain_events_published_total',
      help: 'Total number of domain events published',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.domainEventsProcessed = new Counter({
      name: 'domain_events_processed_total',
      help: 'Total number of domain events processed by subscribers',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.domainEventsSucceeded = new Counter({
      name: 'domain_events_succeeded_total',
      help: 'Total number of domain events successfully handled',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.domainEventsFailed = new Counter({
      name: 'domain_events_failed_total',
      help: 'Total number of domain events that failed',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.websocketConnections = new Gauge({
      name: 'websocket_connections',
      help: 'Number of active websocket connections',
      labelNames: ['tenant', 'outlet'],
      registers: [this.registry],
    });

    this.websocketDisconnects = new Counter({
      name: 'websocket_disconnects_total',
      help: 'Total number of websocket disconnects',
      labelNames: ['tenant', 'outlet'],
      registers: [this.registry],
    });

    this.websocketEventsEmitted = new Counter({
      name: 'websocket_events_emitted_total',
      help: 'Total number of websocket events emitted',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.websocketBroadcastLatency = new Histogram({
      name: 'websocket_broadcast_latency_seconds',
      help: 'Latency for websocket broadcast emits in seconds',
      labelNames: ['event'],
      buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.5],
      registers: [this.registry],
    });

    this.websocketBroadcastFailures = new Counter({
      name: 'websocket_broadcast_failures_total',
      help: 'Total number of websocket broadcast failures',
      labelNames: ['event'],
      registers: [this.registry],
    });

    this.aiIntegrationCalls = new Counter({
      name: 'ai_integration_calls_total',
      help: 'Total AI integration calls',
      labelNames: ['provider', 'operation', 'status'],
      registers: [this.registry],
    });

    this.databaseQueriesTotal = new Counter({
      name: 'database_queries_total',
      help: 'Total number of database queries executed',
      labelNames: ['operation', 'status'],
      registers: [this.registry],
    });

    this.databaseQueryDuration = new Histogram({
      name: 'database_query_duration_seconds',
      help: 'Database query execution duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.redisCommandsTotal = new Counter({
      name: 'redis_commands_total',
      help: 'Total number of Redis commands executed',
      labelNames: ['command', 'status'],
      registers: [this.registry],
    });

    this.redisCommandDuration = new Histogram({
      name: 'redis_command_duration_seconds',
      help: 'Redis command duration in seconds',
      labelNames: ['command'],
      buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.registry],
    });

    this.cacheHitsTotal = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['backend'],
      registers: [this.registry],
    });

    this.cacheMissesTotal = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['backend'],
      registers: [this.registry],
    });

    if (this.enabled) {
      try {
        collectDefaultMetrics({ register: this.registry });
      } catch (err) {
        this.logger.warn(`Failed to collect default metrics: ${err}`);
      }
    }
  }

  /** Return the Prometheus text-format metrics. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Return the metrics content type header. */
  getContentType(): string {
    return this.registry.contentType;
  }

  getMetricsPath(): string {
    return this.path;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  onModuleDestroy() {
    this.registry.clear();
  }
}
