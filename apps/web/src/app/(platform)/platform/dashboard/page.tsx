"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";

import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import {
  getHealth,
  getPlatformBillingAggregate,
  getPlatformTenants,
  platformObservabilityKeys,
  type PlatformTenant,
} from "@/features/platform/api/queries";
import { useAuthStore } from "@/stores/auth.store";

function lifecycleLabel(tenant: PlatformTenant) {
  return tenant.deletedAt ? "Deactivated" : "Active";
}

export default function PlatformDashboardPage() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const canRead = hasPermission(session, "super-admin.read");

  const healthQuery = useQuery({
    queryKey: platformObservabilityKeys.readiness(),
    queryFn: getHealth,
    enabled: canRead,
  });
  const tenantsQuery = useQuery({
    queryKey: ["platform-tenants-dashboard"],
    queryFn: () => getPlatformTenants(token as string),
    enabled: Boolean(token && canRead),
  });
  const aggregateQuery = useQuery({
    queryKey: ["platform-billing-aggregate"],
    queryFn: () => getPlatformBillingAggregate(token as string),
    enabled: Boolean(token && canRead),
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Dashboard access is restricted"
        description="Your platform session does not include the super-admin read permission."
      />
    );
  }

  if (!token) {
    return (
      <UnavailableState
        title="Platform authentication is required"
        description="Sign in with an authorized platform operator session to view dashboard data."
      />
    );
  }

  const aggregate = aggregateQuery.data;
  const recentTenants = tenantsQuery.data?.data.slice(0, 4) ?? [];
  const readiness = healthQuery.data?.data;
  const isReady = Boolean(
    readiness?.database?.ok && readiness?.redis?.ok && readiness?.bullmq?.ok,
  );
  const readinessLabel = healthQuery.isPending
    ? "Checking"
    : healthQuery.isError
      ? "Unavailable"
      : isReady
        ? "Ready"
        : "Not ready";

  return (
    <>
      <PageHeader
        eyebrow="Platform console"
        title="Control room"
        description="Backend-authoritative tenant, user, outlet, subscription, invoice, audit, payment-request, and service-readiness summaries."
        actions={
          <StatusBadge
            tone={healthQuery.isError ? "danger" : isReady ? "success" : "info"}
          >
            {readinessLabel}
          </StatusBadge>
        }
      />

      {aggregateQuery.isError ? (
        <div className="mb-6">
          <UnavailableState
            title="Platform aggregates unavailable"
            description={
              aggregateQuery.error instanceof ApiError &&
              aggregateQuery.error.status === 403
                ? "This platform session is not authorized to read financial aggregates."
                : "The platform aggregate API could not be reached."
            }
          />
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Tenants"
          value={
            aggregateQuery.isPending
              ? "Loading"
              : aggregate
                ? String(aggregate.tenants.total)
                : "Unavailable"
          }
          detail="Platform total from the aggregate API"
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
        <MetricCard
          title="Subscriptions"
          value={
            aggregateQuery.isPending
              ? "Loading"
              : aggregate
                ? String(aggregate.subscriptions.total)
                : "Unavailable"
          }
          detail="Current platform subscription records"
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
        <MetricCard
          title="Invoices"
          value={
            aggregateQuery.isPending
              ? "Loading"
              : aggregate
                ? String(aggregate.invoices.total)
                : "Unavailable"
          }
          detail="Invoice records across platform tenants"
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
        <MetricCard
          title="Payment requests"
          value={
            aggregateQuery.isPending
              ? "Loading"
              : aggregate
                ? String(aggregate.paymentRequests.total)
                : "Unavailable"
          }
          detail="Recorded payment request attempts"
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Users"
          value={aggregateQuery.isPending ? "Loading" : aggregate ? String(aggregate.users.total) : "Unavailable"}
          detail="Active platform-wide user records"
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
        <MetricCard
          title="Outlets"
          value={aggregateQuery.isPending ? "Loading" : aggregate ? String(aggregate.outlets.total) : "Unavailable"}
          detail="Active platform-wide outlets"
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
        <MetricCard
          title="Platform audit events"
          value={aggregateQuery.isPending ? "Loading" : aggregate ? String(aggregate.platformAudit.last24Hours) : "Unavailable"}
          detail={aggregate ? `${aggregate.platformAudit.total.toLocaleString()} total recorded` : "Last 24 hours"}
          tone={aggregateQuery.isError ? "danger" : "info"}
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="Readiness"
          value={readinessLabel}
          detail="Database, Redis, and BullMQ readiness response"
          tone={
            healthQuery.isError ? "danger" : isReady ? "success" : "warning"
          }
        />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader eyebrow="Tenants" title="Recent tenant records" />
          <div className="mt-4 space-y-3">
            {tenantsQuery.isPending ? (
              <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" />
            ) : null}
            {tenantsQuery.isError ? (
              <UnavailableState
                title="Tenant overview unavailable"
                description={
                  tenantsQuery.error instanceof ApiError &&
                  tenantsQuery.error.status === 403
                    ? "This platform session is not authorized to read tenant records."
                    : "The platform tenant API could not be reached."
                }
              />
            ) : null}
            {recentTenants.map((tenant) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3"
              >
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {tenant.name}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {tenant.businessType ?? "Business type unavailable"}
                  </p>
                </div>
                <StatusBadge tone={tenant.deletedAt ? "neutral" : "info"}>
                  {lifecycleLabel(tenant)}
                </StatusBadge>
              </div>
            ))}
            {!recentTenants.length &&
            !tenantsQuery.isPending &&
            !tenantsQuery.isError ? (
              <EmptyState
                title="No tenants found"
                description="The platform API returned an empty tenant collection."
              />
            ) : null}
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader
            eyebrow="Subscriptions"
            title="Subscriptions by status"
          />
          {aggregateQuery.isPending ? (
            <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" />
          ) : aggregateQuery.isError ? (
            <UnavailableState
              title="Subscription summary unavailable"
              description="Subscription aggregates could not be loaded."
            />
          ) : !aggregate?.subscriptions.byStatus.length ? (
            <EmptyState
              title="No subscription records"
              description="The platform aggregate returned no subscription status groups."
            />
          ) : (
            <div className="mt-4 space-y-3">
              {aggregate.subscriptions.byStatus.map((entry) => (
                <div
                  key={entry.status}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3"
                >
                  <span className="text-sm text-[var(--foreground)]">
                    {entry.status}
                  </span>
                  <strong className="text-sm text-[var(--foreground)]">
                    {entry.count}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader
            eyebrow="Invoices"
            title="Invoice amounts by status and currency"
          />
          <p className="mb-4 text-xs text-[var(--muted-foreground)]">
            Amounts are shown in minor currency units; this is not a
            recognized-revenue metric.
          </p>
          {aggregateQuery.isPending ? (
            <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" />
          ) : aggregateQuery.isError ? (
            <UnavailableState
              title="Invoice summary unavailable"
              description="Invoice aggregates could not be loaded."
            />
          ) : !aggregate?.invoices.byStatusAndCurrency.length ? (
            <EmptyState
              title="No invoice records"
              description="The platform aggregate returned no invoice status and currency groups."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Currency</th>
                    <th className="px-3 py-3">Invoices</th>
                    <th className="px-3 py-3">Amount (minor)</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregate.invoices.byStatusAndCurrency.map((entry) => (
                    <tr
                      key={`${entry.status}-${entry.currency}`}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <th
                        scope="row"
                        className="px-3 py-3 font-medium text-[var(--foreground)]"
                      >
                        {entry.status}
                      </th>
                      <td className="px-3 py-3 text-[var(--muted-foreground)]">
                        {entry.currency}
                      </td>
                      <td className="px-3 py-3 text-[var(--muted-foreground)]">
                        {entry.count}
                      </td>
                      <td className="px-3 py-3 text-[var(--muted-foreground)]">
                        {entry.amountCents.toLocaleString("en-US")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
          <SectionHeader eyebrow="Payment requests" title="Attempts by state" />
          {aggregateQuery.isPending ? (
            <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" />
          ) : aggregateQuery.isError ? (
            <UnavailableState
              title="Payment request summary unavailable"
              description="Payment request aggregates could not be loaded."
            />
          ) : !aggregate?.paymentRequests.byState.length ? (
            <EmptyState
              title="No payment requests"
              description="The platform aggregate returned no payment request state groups."
            />
          ) : (
            <div className="mt-4 space-y-3">
              {aggregate.paymentRequests.byState.map((entry) => (
                <div
                  key={entry.state}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3"
                >
                  <span className="text-sm text-[var(--foreground)]">
                    {entry.state}
                  </span>
                  <strong className="text-sm text-[var(--foreground)]">
                    {entry.count}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)] xl:col-span-2">
          <SectionHeader eyebrow="System health" title="Readiness signals" />
          <div className="mt-4 space-y-3">
            {healthQuery.isPending ? (
              <div className="h-20 animate-pulse rounded-2xl bg-[var(--muted)]" />
            ) : null}
            {healthQuery.isError ? (
              <UnavailableState
                title="Readiness unavailable"
                description="The platform health endpoint could not be reached."
              />
            ) : null}
            {readiness ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Database", ok: readiness.database.ok },
                  { label: "Redis", ok: readiness.redis.ok },
                  { label: "BullMQ", ok: readiness.bullmq.ok },
                ].map((signal) => (
                  <div
                    key={signal.label}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      {signal.label}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <strong className="text-sm text-[var(--foreground)]">
                        {signal.ok ? "Available" : "Unavailable"}
                      </strong>
                      <StatusBadge tone={signal.ok ? "success" : "danger"}>
                        {signal.ok ? "Ready" : "Down"}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
