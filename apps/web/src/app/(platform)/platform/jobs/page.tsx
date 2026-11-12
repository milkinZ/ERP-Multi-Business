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
import {
  getPlatformFailedJobs,
  getPlatformQueues,
  platformObservabilityKeys,
} from "@/features/platform/api/queries";
import { usePlatformRealtime } from "@/features/platform/hooks/use-platform-realtime";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

export default function PlatformJobsPage() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const canRead = hasPermission(session, "super-admin.read");
  const isRealtimeConnected = usePlatformRealtime(canRead);
  const refetchInterval = isRealtimeConnected ? 60_000 : 15_000;

  const queuesQuery = useQuery({
    queryKey: platformObservabilityKeys.queues(),
    queryFn: () => {
      if (!token) throw new Error("Platform authentication is required");
      return getPlatformQueues(token);
    },
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
    refetchInterval,
  });
  const failedJobsQuery = useQuery({
    queryKey: platformObservabilityKeys.failedJobs(),
    queryFn: () => {
      if (!token) throw new Error("Platform authentication is required");
      return getPlatformFailedJobs(token);
    },
    enabled: Boolean(token && canRead),
    staleTime: 15_000,
    refetchInterval,
  });

  if (!canRead)
    return (
      <UnavailableState
        title="Queue access is restricted"
        description="Your platform session does not include the super-admin read permission."
      />
    );
  if (!token)
    return (
      <UnavailableState
        title="Platform authentication is required"
        description="Sign in with an authorized platform operator session to view queue state."
      />
    );

  return (
    <>
      <PageHeader
        eyebrow="Platform console / operations"
        title="Jobs and queues"
        description="Read-only queue snapshots and bounded failed-job metadata. Job payloads, raw errors, retry, and mutation controls are not exposed."
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={isRealtimeConnected ? "success" : "warning"}>
              {isRealtimeConnected ? "Realtime connected" : "Polling fallback"}
            </StatusBadge>
            {failedJobsQuery.data?.length ? (
              <StatusBadge tone="danger">
                {failedJobsQuery.data.length} recent failed jobs
              </StatusBadge>
            ) : null}
            <StatusBadge tone="info">Read only</StatusBadge>
          </div>
        }
      />

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader eyebrow="Queue state" title="BullMQ queues" />
        {queuesQuery.isPending ? (
          <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" />
        ) : queuesQuery.isError ? (
          <UnavailableState
            title="Queue snapshots unavailable"
            description="The authorized queue-monitor endpoint could not be reached."
          />
        ) : !queuesQuery.data?.data.length ? (
          <EmptyState
            title="No queue snapshots"
            description="The existing queue-monitor API returned no queue records."
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
                {queuesQuery.data.data.map((queue) => (
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

      <section className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
        <SectionHeader
          eyebrow="Dead-letter visibility"
          title="Recent failed jobs"
          action={
            <span className="text-xs text-[var(--muted-foreground)]">
              Bounded, read-only metadata · no payload or raw error
            </span>
          }
        />
        {failedJobsQuery.isPending ? (
          <div className="h-32 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : failedJobsQuery.isError ? (
          <UnavailableState
            title="Failed-job summaries unavailable"
            description="The authorized failed-job summary endpoint could not be reached."
          />
        ) : !failedJobsQuery.data?.length ? (
          <EmptyState
            title="No failed jobs"
            description="No failed jobs were found in the bounded queue snapshot."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  {["Queue", "Job", "Failed at", "Attempts"].map((heading) => (
                    <th key={heading} className="px-3 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failedJobsQuery.data.map((job, index) => (
                  <tr
                    key={`${job.queueName}-${job.jobName}-${job.failedAt}-${index}`}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <th
                      scope="row"
                      className="px-3 py-3 font-medium text-[var(--foreground)]"
                    >
                      {job.queueName}
                    </th>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {job.jobName}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {formatDate(job.failedAt)}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted-foreground)]">
                      {job.attemptsMade} / {job.maxAttempts}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
