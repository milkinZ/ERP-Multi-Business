"use client";

import React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/data-display/states";
import {
  createPlatformTenant,
  getPlatformFeatureModules,
  getPlatformPlans,
  getPlatformTenants,
  type PlatformTenant,
} from "@/features/platform/api/queries";
import { useAuthStore } from "@/stores/auth.store";

function tenantLifecycleLabel(tenant: PlatformTenant) {
  return tenant.deletedAt ? "Deactivated" : "Active";
}

export default function TenantsPage() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [businessType, setBusinessType] = useState<"CAFE" | "RETAIL">("CAFE");
  const [planId, setPlanId] = useState("");
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const query = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getPlatformTenants(token as string),
    enabled: Boolean(token),
  });
  const plansQuery = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getPlatformPlans(token as string),
    enabled: Boolean(token),
  });
  const modulesQuery = useQuery({
    queryKey: ["platform-feature-modules"],
    queryFn: () => getPlatformFeatureModules(token as string),
    enabled: Boolean(token),
  });
  const createTenant = useMutation({
    mutationFn: () => {
      const selectedPlan = plansQuery.data?.find((plan) => plan.id === planId);
      const includedIds = new Set(
        selectedPlan?.modules.map((item) => item.moduleId) ?? [],
      );
      const selectedAddons = (modulesQuery.data ?? []).filter(
        (module) => moduleIds.includes(module.id) && !includedIds.has(module.id),
      );
      const recurringTotal =
        (selectedPlan?.priceCents ?? 0) +
        selectedAddons.reduce((total, module) => total + module.monthlyPriceCents, 0);
      if (!token || !planId || recurringTotal <= 0) {
        throw new Error("Choose a plan and paid add-ons with a positive monthly total.");
      }
      return createPlatformTenant(token, {
        name,
        ownerEmail,
        businessType,
        currencyCode: "IDR",
        planId,
        moduleIds,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      setName("");
      setOwnerEmail("");
    },
  });

  const tenants = query.data?.data ?? [];
  const selectedPlanId =
    planId ||
    plansQuery.data?.find((plan) => plan.type === "STARTER")?.id ||
    plansQuery.data?.find((plan) => plan.priceCents > 0)?.id ||
    plansQuery.data?.[0]?.id ||
    "";
  const selectedPlan = plansQuery.data?.find(
    (plan) => plan.id === selectedPlanId,
  );
  const includedModuleIds = new Set(
    selectedPlan?.modules.map((item) => item.moduleId) ?? [],
  );
  const selectedAddons = (modulesQuery.data ?? []).filter(
    (module) => moduleIds.includes(module.id) && !includedModuleIds.has(module.id),
  );
  const recurringTotal =
    (selectedPlan?.priceCents ?? 0) +
    selectedAddons.reduce((total, module) => total + module.monthlyPriceCents, 0);

  React.useEffect(() => {
    if (!planId && selectedPlanId) setPlanId(selectedPlanId);
  }, [planId, selectedPlanId]);
  React.useEffect(() => {
    if (selectedPlan) {
      setModuleIds((current) =>
        current.filter(
          (id) =>
            !selectedPlan.modules.some((item) => item.moduleId === id),
        ),
      );
    }
  }, [selectedPlan]);

  return (
    <>
      <PageHeader
        eyebrow="Platform console / administration"
        title="Tenants"
        description="Platform-level tenant registry using the verified super-admin API contract and tenant-scoped lifecycle semantics."
        actions={<StatusBadge tone="info">Platform scope</StatusBadge>}
      />

      {!token ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
          Platform authentication is required to view tenant records.
        </div>
      ) : query.isPending ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-8">
          <div className="h-12 animate-pulse rounded-xl bg-[var(--muted)]" />
        </div>
      ) : query.isError ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">
          The platform API rejected this request or is unavailable.
        </div>
      ) : (
        <>
          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
            <SectionHeader
              eyebrow="Provisioning"
              title="Create tenant workspace"
            />
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Creates a paid subscription and pending first invoice, sets up the
              Owner role, and emails a one-time invitation. No payment is
              requested.
            </p>
            <form
              className="mt-5 grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                createTenant.mutate();
              }}
            >
              <label className="grid gap-2 text-sm font-medium">
                Tenant name
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Initial Owner email
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={ownerEmail}
                  onChange={(event) => setOwnerEmail(event.target.value)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Business type
                <select
                  value={businessType}
                  onChange={(event) =>
                    setBusinessType(event.target.value as "CAFE" | "RETAIL")
                  }
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                >
                  <option value="CAFE">Cafe / F&amp;B</option>
                  <option value="RETAIL">Retail</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Paid plan
                <select
                  required
                  value={selectedPlanId}
                  onChange={(event) => setPlanId(event.target.value)}
                  disabled={plansQuery.isPending || (plansQuery.data ?? []).length === 0}
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                >
                  {(plansQuery.data ?? []).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · IDR{" "}
                      {plan.priceCents.toLocaleString("id-ID")}
                    </option>
                  ))}
                </select>
              </label>
              {plansQuery.isError || modulesQuery.isError ? (
                <p role="alert" className="text-sm text-red-600 md:col-span-2">
                  Could not load plans or modules. Reload before provisioning.
                </p>
              ) : null}
              <fieldset className="grid gap-2 md:col-span-2">
                <legend className="text-sm font-medium">Optional monthly modules</legend>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Modules included in the selected plan are not charged twice. Add-on pricing is applied to the recurring subscription.
                </p>
                {(modulesQuery.data ?? [])
                  .filter((module) => module.isActive && !includedModuleIds.has(module.id))
                  .map((module) => (
                    <label key={module.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={moduleIds.includes(module.id)}
                        onChange={(event) =>
                          setModuleIds((current) =>
                            event.target.checked
                              ? [...current, module.id]
                              : current.filter((id) => id !== module.id),
                          )
                        }
                      />
                      <span className="flex-1">{module.name}</span>
                      <span>{module.monthlyPriceCents.toLocaleString("id-ID")} IDR/month</span>
                    </label>
                  ))}
                {!modulesQuery.isPending && !modulesQuery.data?.some((module) => module.isActive && !includedModuleIds.has(module.id)) ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No optional modules are currently available.</p>
                ) : null}
                <p className="font-semibold">Monthly total: IDR {recurringTotal.toLocaleString("id-ID")}</p>
              </fieldset>
              {createTenant.isError ? (
                <p role="alert" className="text-sm text-red-600 md:col-span-2">
                  {createTenant.error instanceof Error
                    ? createTenant.error.message
                    : "Tenant provisioning failed."}
                </p>
              ) : null}
              {createTenant.isSuccess ? (
                <p
                  role="status"
                  className="text-sm text-green-700 md:col-span-2"
                >
                  Tenant created. Invoice{" "}
                  {createTenant.data.invoice.invoiceNumber} is pending for IDR{" "}
                  {createTenant.data.invoice.amountCents.toLocaleString(
                    "id-ID",
                  )}
                  ; the Owner invitation was emailed.{" "}
                  <Link
                    href={`/platform/tenants/${createTenant.data.tenant.id}`}
                    className="font-medium underline"
                  >
                    View tenant
                  </Link>
                </p>
              ) : null}
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={
                    createTenant.isPending ||
                    plansQuery.isPending ||
                    modulesQuery.isPending ||
                    !selectedPlanId ||
                    recurringTotal <= 0
                  }
                  className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createTenant.isPending ? "Provisioning..." : "Create tenant"}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)]">
            <SectionHeader eyebrow="Directory" title="Tenant registry" />
            {!tenants.length ? (
              <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">
                The API returned an empty tenant collection.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {tenants.map((tenant) => (
                  <article
                    key={tenant.id}
                    className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-alt)] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <Link
                        href={`/platform/tenants/${tenant.id}`}
                        className="font-medium text-[var(--foreground)] hover:text-[var(--primary)]"
                      >
                        {tenant.name}
                      </Link>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {tenant.businessType ?? "Business type unavailable"} ·{" "}
                        {tenant.contactEmail ?? "No contact email"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        tone={tenant.deletedAt ? "neutral" : "success"}
                      >
                        {tenantLifecycleLabel(tenant)}
                      </StatusBadge>
                      <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {tenant.id}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
