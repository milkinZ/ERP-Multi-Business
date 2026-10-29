"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import {
  getHealth,
  getLiveness,
  getPlatformOperationalTelemetry,
  getPlatformQueues,
  platformObservabilityKeys,
} from "@/features/platform/api/queries";
import { useAuthStore } from "@/stores/auth.store";

function readinessTone(ok: boolean | undefined, isError = false) {
  if (isError || ok === false) return "danger" as const;
  if (ok === true) return "success" as const;
  return "neutral" as const;
}

function readinessLabel(
  ok: boolean | undefined,
  isPending: boolean,
  isError: boolean,
) {
  if (isPending) return "Checking";
  if (isError || ok === undefined) return "Unavailable";
  return ok ? "Ready" : "Down";
}

function HealthSignal({ label, ok }: { label: string; ok: boolean }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <strong className="text-sm text-[var(--foreground)]">
          {ok ? "Available" : "Unavailable"}
        </strong>
        <StatusBadge tone={readinessTone(ok)}>
          {ok ? "Ready" : "Down"}
        </StatusBadge>
      </div>
    </article>
  );
}

export default function ObservabilityPage() {
  const [telemetryWindowHours, setTelemetryWindowHours] = React.useState(24);
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const canRead = hasPermission(session, "super-admin.read");
  const telemetryRange = React.useMemo(() => {
    const to = new Date();
    return {
      from: new Date(
        to.getTime() - telemetryWindowHours * 60 * 60 * 1000,
      ).toISOString(),
      to: to.toISOString(),
    };
  }, [telemetryWindowHours]);

  const readinessQuery = useQuery({
    queryKey: platformObservabilityKeys.readiness(),
    queryFn: getHealth,
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
  });
  const livenessQuery = useQuery({
    queryKey: platformObservabilityKeys.liveness(),
    queryFn: getLiveness,
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
  });
  const queuesQuery = useQuery({
    queryKey: platformObservabilityKeys.queues(),
    queryFn: () => getPlatformQueues(token as string),
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
  });
  const telemetryQuery = useQuery({
    queryKey: [...platformObservabilityKeys.telemetry(), telemetryWindowHours],
    queryFn: () =>
      getPlatformOperationalTelemetry(token as string, telemetryRange),
    enabled: Boolean(token && canRead),
    staleTime: 30_000,
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Observability access is restricted"
        description="Your platform session does not include the super-admin read permission."
      />
    );
  if (!token)
    return (
      <UnavailableState
        title="Platform authentication is required"
        description="Sign in with an authorized platform operator session to view operational signals."
      />
    );

  const readiness = readinessQuery.data?.data;
  const ready = Boolean(
    readiness?.database?.ok && readiness?.redis?.ok && readiness?.bullmq?.ok,
  );
  const overallLabel = readinessLabel(
    ready,
    readinessQuery.isPending,
    readinessQuery.isError,
  );

  return (
    <>
      <PageHeader
        eyebrow="Platform console / live signals"
        title="Observability"
        description="Current request-time health, liveness, and bounded queue snapshots from authoritative platform endpoints."
        actions={
          <StatusBadge tone={readinessTone(ready, readinessQuery.isError)}>
            {overallLabel}
          </StatusBadge>
        }
      />

      <section
        aria-labelledby="system-health-heading"
        className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
      >
        <SectionHeader
          title="System health"
          action={
            <span className="text-xs text-[var(--muted-foreground)]">
              Request-time readiness
            </span>
          }
        />
        {readinessQuery.isPending ? (
          <div className="h-24 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : readinessQuery.isError ? (
          <UnavailableState
            title="Readiness unavailable"
            description={
              readinessQuery.error instanceof ApiError
                ? readinessQuery.error.message
                : "The readiness endpoint could not be reached."
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <HealthSignal
              label="Database"
              ok={Boolean(readiness?.database.ok)}
            />
            <HealthSignal label="Redis" ok={Boolean(readiness?.redis.ok)} />
            <HealthSignal label="BullMQ" ok={Boolean(readiness?.bullmq.ok)} />
          </div>
        )}
      </section>

      <section
        aria-labelledby="liveness-heading"
        className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
      >
        <SectionHeader
          title="Application liveness"
          action={
            <span className="text-xs text-[var(--muted-foreground)]">
              Process-alive signal
            </span>
          }
        />
        {livenessQuery.isPending ? (
          <div className="h-16 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : livenessQuery.isError ? (
          <UnavailableState
            title="Liveness unavailable"
            description="The liveness endpoint could not be reached."
          />
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {livenessQuery.data?.message}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Observed {livenessQuery.data?.timestamp}
              </p>
            </div>
            <StatusBadge
              tone={livenessQuery.data?.success ? "success" : "danger"}
            >
              {livenessQuery.data?.success ? "Alive" : "Unavailable"}
            </StatusBadge>
          </div>
        )}
      </section>

      <section
        aria-labelledby="queue-health-heading"
        className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
      >
        <SectionHeader
          title="Queue health"
          action={
            <span className="text-xs text-[var(--muted-foreground)]">
              Bounded BullMQ snapshots
            </span>
          }
        />
        {queuesQuery.isPending ? (
          <div className="h-24 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : queuesQuery.isError ? (
          <UnavailableState
            title="Queue snapshots unavailable"
            description={
              queuesQuery.error instanceof ApiError &&
              queuesQuery.error.status === 403
                ? "This platform session is not authorized to read queue snapshots."
                : "The queue monitor endpoint could not be reached."
            }
          />
        ) : !queuesQuery.data?.data.length ? (
          <EmptyState
            title="No queue snapshots"
            description="The queue monitor returned no queue records."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  {[
                    "Queue",
                    "Waiting",
                    "Active",
                    "Delayed",
                    "Failed",
                    "Completed",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queuesQuery.data?.data.map((queue) => (
                  <tr
                    key={queue.name}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-3 py-3 font-medium text-[var(--foreground)]"
                    >
                      {queue.name}
                    </th>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {queue.waiting}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {queue.active}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {queue.delayed}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {queue.failed}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {queue.completed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="historical-telemetry-heading"
        className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]"
      >
        <SectionHeader
          title="Historical telemetry"
          action={
            <span className="text-xs text-[var(--muted-foreground)]">
              Aggregated request metrics · 30-day retention
            </span>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-[var(--muted-foreground)]">
            Window:
          </span>
          {[
            { hours: 1, label: "1 hour" },
            { hours: 24, label: "24 hours" },
            { hours: 24 * 7, label: "7 days" },
          ].map(({ hours, label }) => (
            <button
              key={hours}
              type="button"
              aria-pressed={telemetryWindowHours === hours}
              onClick={() => setTelemetryWindowHours(hours)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                telemetryWindowHours === hours
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--panel-alt)]"
              }`}
            >
              {label}
            </button>
          ))}
          {telemetryQuery.data && (
            <span className="ml-auto text-xs text-[var(--muted-foreground)]">
              {new Date(telemetryQuery.data.range.from).toLocaleString(
                undefined,
                { timeZone: "UTC", timeZoneName: "short" },
              )}{" "}
              –{" "}
              {new Date(telemetryQuery.data.range.to).toLocaleString(
                undefined,
                { timeZone: "UTC", timeZoneName: "short" },
              )}
            </span>
          )}
        </div>
        {telemetryQuery.isPending ? (
          <div className="h-32 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : telemetryQuery.isError ? (
          <UnavailableState
            title="Historical telemetry unavailable"
            description={
              telemetryQuery.error instanceof ApiError &&
              telemetryQuery.error.status === 403
                ? "This platform session is not authorized to read operational telemetry."
                : "The telemetry endpoint could not be reached."
            }
          />
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                Request aggregates · selected window
              </h3>
              {!telemetryQuery.data.metrics.length ? (
                <EmptyState
                  title="No historical metrics yet"
                  description="Aggregated request data will appear after the first telemetry flush."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                        {[
                          "Route",
                          "Method",
                          "Status",
                          "Requests",
                          "Errors",
                          "Average ms",
                        ].map((heading) => (
                          <th key={heading} className="px-3 py-3">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {telemetryQuery.data.metrics.map((metric) => (
                        <tr
                          key={`${metric.method}-${metric.route}-${metric.statusClass}`}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <th
                            scope="row"
                            className="px-3 py-3 font-mono text-xs font-medium text-[var(--foreground)]"
                          >
                            {metric.route}
                          </th>
                          <td className="px-3 py-3 text-[var(--muted-foreground)]">
                            {metric.method}
                          </td>
                          <td className="px-3 py-3 text-[var(--muted-foreground)]">
                            {metric.statusClass}
                          </td>
                          <td className="px-3 py-3 text-[var(--muted-foreground)]">
                            {metric.requestCount.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-[var(--muted-foreground)]">
                            {metric.errorCount.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-[var(--muted-foreground)]">
                            {metric.requestCount
                              ? Math.round(
                                  metric.durationTotalMs / metric.requestCount,
                                ).toLocaleString()
                              : "0"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
                Redacted operational events
              </h3>
              {!telemetryQuery.data.events.length ? (
                <EmptyState
                  title="No operational events"
                  description="Only server errors and slow responses are recorded; request bodies, identifiers, and raw error text are excluded."
                />
              ) : (
                <div className="space-y-2">
                  {telemetryQuery.data.events.map((event) => (
                    <article
                      key={event.id}
                      className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={event.level === "ERROR" ? "danger" : "neutral"}
                        >
                          {event.level}
                        </StatusBadge>
                        <span className="text-sm font-medium text-[var(--foreground)]">
                          {event.eventType.replaceAll("_", " ")}
                        </span>
                        <span className="font-mono text-xs text-[var(--muted-foreground)]">
                          {event.method} {event.route}
                        </span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          HTTP {event.statusCode} ·{" "}
                          {event.durationMs.toLocaleString()} ms
                        </span>
                      </div>
                      <time className="text-xs text-[var(--muted-foreground)]">
                        {new Date(event.createdAt).toLocaleString(undefined, {
                          timeZone: "UTC",
                          timeZoneName: "short",
                        })}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
