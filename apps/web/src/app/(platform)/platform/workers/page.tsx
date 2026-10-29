"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import {
  PageHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import {
  getPlatformJobExecutions,
  getPlatformWorkers,
} from "@/features/platform/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function jobStatusTone(status: string) {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "ACTIVE":
      return "info";
    default:
      return "warning";
  }
}

export default function PlatformWorkersPage() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const canRead = hasPermission(session, "super-admin.read");
  const workersQuery = useQuery({
    queryKey: ["platform-workers"],
    queryFn: () => {
      if (!token) throw new Error("Platform authentication is required");
      return getPlatformWorkers(token);
    },
    enabled: Boolean(token && canRead),
    refetchInterval: 30_000,
  });
  const jobExecutionsQuery = useQuery({
    queryKey: ["platform-job-executions", { page: 1, limit: 25 }],
    queryFn: () => {
      if (!token) throw new Error("Platform authentication is required");
      return getPlatformJobExecutions(token, { page: 1, limit: 25 });
    },
    enabled: Boolean(token && canRead),
    refetchInterval: 30_000,
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Worker access is restricted"
        description="Your platform session does not include the super-admin read permission."
      />
    );
  if (!token)
    return (
      <UnavailableState
        title="Platform authentication is required"
        description="Sign in with an authorized platform operator session to view worker information."
      />
    );

  return (
    <>
      <PageHeader
        eyebrow="Platform console / runtime"
        title="Workers and job history"
        description="Persisted worker identity, heartbeat, and bounded job execution metadata. Payloads and raw error messages are never exposed."
        actions={
          <StatusBadge tone={workersQuery.isError ? "danger" : "info"}>
            {workersQuery.isError ? "Registry unavailable" : "Live registry"}
          </StatusBadge>
        }
      />

      <section className="mt-6">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">
          Workers
        </h2>
        {workersQuery.isError ? (
          <UnavailableState
            title="Worker registry unavailable"
            description="The authorized worker registry could not be reached."
          />
        ) : null}
        {workersQuery.isPending ? (
          <div className="mt-4 h-32 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        ) : null}
        {workersQuery.data?.length === 0 ? (
          <p className="mt-4 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--muted-foreground)]">
            No worker heartbeats have been recorded.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workersQuery.data?.map((worker) => (
            <article
              key={worker.id}
              className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--foreground)]">
                    {worker.name}
                  </h3>
                  <p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">
                    {worker.workerKey}
                  </p>
                </div>
                <StatusBadge
                  tone={
                    worker.status === "ACTIVE"
                      ? "success"
                      : worker.status === "STALE"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {worker.status}
                </StatusBadge>
              </div>
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                Last heartbeat: {formatDate(worker.lastHeartbeatAt)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Recent job attempts
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Latest 25 persisted attempts, refreshed every 30 seconds.
            </p>
          </div>
          {jobExecutionsQuery.data ? (
            <span className="text-sm text-[var(--muted-foreground)]">
              {jobExecutionsQuery.data.pagination.total} total
            </span>
          ) : null}
        </div>
        {jobExecutionsQuery.isError ? (
          <UnavailableState
            title="Job history unavailable"
            description="The authorized job execution history could not be reached."
          />
        ) : null}
        {jobExecutionsQuery.isPending ? (
          <div className="mt-4 h-32 animate-pulse rounded-[24px] bg-[var(--muted)]" />
        ) : null}
        {jobExecutionsQuery.data?.data.length === 0 ? (
          <p className="mt-4 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--muted-foreground)]">
            No job execution attempts have been recorded.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3">
          {jobExecutionsQuery.data?.data.map((job) => (
            <article
              key={job.id}
              className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--foreground)]">
                    {job.jobName ?? "Unnamed job"}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {job.queueName} · Attempt {job.attemptNumber}
                  </p>
                </div>
                <StatusBadge tone={jobStatusTone(job.status)}>
                  {job.status}
                </StatusBadge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[var(--muted-foreground)]">Started</dt>
                  <dd className="mt-1 text-[var(--foreground)]">
                    {formatDate(job.startedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Finished</dt>
                  <dd className="mt-1 text-[var(--foreground)]">
                    {formatDate(job.finishedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Duration</dt>
                  <dd className="mt-1 text-[var(--foreground)]">
                    {job.durationMs === null
                      ? "Not recorded"
                      : `${job.durationMs} ms`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">
                    Error category
                  </dt>
                  <dd className="mt-1 text-[var(--foreground)]">
                    {job.errorCategory ?? "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">
          Supported visibility
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
          Queue health
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Current queue counts are available through the accepted Observability
          contract.
        </p>
        <Link
          href="/platform/observability"
          className="mt-4 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--panel-alt)]"
        >
          Open observability
        </Link>
      </section>
    </>
  );
}
