"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatusBadge,
  UnavailableState,
} from "@/components/data-display/states";
import {
  createPlatformPlan,
  getPlatformFeatureModules,
  getPlatformPlans,
  getPlatformTenantFeatureFlags,
  getPlatformTenants,
  updatePlatformFeatureModule,
  updatePlatformPlan,
  updatePlatformTenantFeatureFlag,
  type PlatformFeatureModule,
  type PlatformPlan,
} from "@/features/platform/api/queries";
import { hasPermission } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

const PLAN_TYPES = ["FREE", "STARTER", "BUSINESS", "ENTERPRISE"] as const;
type PlanType = (typeof PLAN_TYPES)[number];
const EMPTY_PLANS: PlatformPlan[] = [];
const currency = (amount: number) => `IDR ${amount.toLocaleString("id-ID")}`;
const DEFAULT_MODULE_KEYS: Record<PlanType, string[]> = {
  FREE: [],
  STARTER: ["INVENTORY"],
  BUSINESS: ["INVENTORY", "PROCUREMENT", "ANALYTICS"],
  ENTERPRISE: ["INVENTORY", "PROCUREMENT", "FINANCE", "ANALYTICS"],
};

function defaultModuleIds(type: PlanType, modules: PlatformFeatureModule[]) {
  const defaultKeys = DEFAULT_MODULE_KEYS[type];
  return modules
    .filter((module) => module.isActive && defaultKeys.includes(module.key))
    .map((module) => module.id);
}

function nullableLimit(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : Number.NaN;
}

export default function PlatformPlansPage() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const queryClient = useQueryClient();
  const canRead = hasPermission(session, "super-admin.read");
  const canManagePlans = hasPermission(session, "super-admin.manage.plans");
  const canManageFlags = hasPermission(
    session,
    "super-admin.manage.feature-flags",
  );
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [planType, setPlanType] = useState<PlanType>("STARTER");
  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState("");
  const [maxOutlets, setMaxOutlets] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [maxMonthlyOrders, setMaxMonthlyOrders] = useState("");
  const [includedModuleIds, setIncludedModuleIds] = useState<string[]>([]);
  const [modulePriceDrafts, setModulePriceDrafts] = useState<
    Record<string, string>
  >({});
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getPlatformPlans(token as string),
    enabled: Boolean(token && canRead),
  });
  const modulesQuery = useQuery({
    queryKey: ["platform-feature-modules"],
    queryFn: () => getPlatformFeatureModules(token as string),
    enabled: Boolean(token && canRead),
  });
  const tenantsQuery = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getPlatformTenants(token as string),
    enabled: Boolean(token && canRead && canManageFlags),
  });
  const activeTenants = (tenantsQuery.data?.data ?? []).filter(
    (tenant) => !tenant.deletedAt,
  );
  useEffect(() => {
    if (!selectedTenantId && activeTenants[0]) {
      setSelectedTenantId(activeTenants[0].id);
    }
  }, [activeTenants, selectedTenantId]);

  const tenantFlagsQuery = useQuery({
    queryKey: ["platform-tenant-feature-flags", selectedTenantId],
    queryFn: () =>
      getPlatformTenantFeatureFlags(token as string, selectedTenantId),
    enabled: Boolean(token && canRead && selectedTenantId),
  });
  const plans = plansQuery.data ?? EMPTY_PLANS;
  const modules = modulesQuery.data ?? [];
  const currentPlan = plans.find((plan) => plan.id === selectedPlanId);
  const availablePlanTypes = useMemo(
    () =>
      PLAN_TYPES.filter((type) => !plans.some((plan) => plan.type === type)),
    [plans],
  );

  useEffect(() => {
    if (currentPlan) {
      setPlanType(currentPlan.type as PlanType);
      setName(currentPlan.name);
      setPriceCents(String(currentPlan.priceCents));
      setMaxOutlets(currentPlan.maxOutlets?.toString() ?? "");
      setMaxUsers(currentPlan.maxUsers?.toString() ?? "");
      setMaxMonthlyOrders(currentPlan.maxMonthlyOrders?.toString() ?? "");
      setIncludedModuleIds(currentPlan.modules.map((item) => item.moduleId));
    }
  }, [currentPlan]);

  const savePlan = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Platform authentication is required.");
      const parsedPrice = Number(priceCents);
      const limits = [
        nullableLimit(maxOutlets),
        nullableLimit(maxUsers),
        nullableLimit(maxMonthlyOrders),
      ];
      if (
        !name.trim() ||
        !Number.isSafeInteger(parsedPrice) ||
        parsedPrice < 0 ||
        limits.some((limit) => Number.isNaN(limit))
      ) {
        throw new Error("Enter a plan name, valid price, and valid limits.");
      }
      const input = {
        name: name.trim(),
        priceCents: parsedPrice,
        maxOutlets: limits[0] ?? null,
        maxUsers: limits[1] ?? null,
        maxMonthlyOrders: limits[2] ?? null,
        moduleIds: includedModuleIds,
      };
      return currentPlan
        ? updatePlatformPlan(token, currentPlan.id, input)
        : createPlatformPlan(token, { ...input, type: planType });
    },
    onSuccess: async (plan) => {
      setSelectedPlanId(plan.id);
      setMessage(`${plan.name} saved.`);
      await queryClient.invalidateQueries({ queryKey: ["platform-plans"] });
    },
  });

  const updateModule = useMutation({
    mutationFn: (input: {
      id: string;
      isActive?: boolean;
      monthlyPriceCents?: number;
    }) => {
      if (!token) throw new Error("Platform authentication is required.");
      return updatePlatformFeatureModule(token, input.id, {
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.monthlyPriceCents !== undefined
          ? { monthlyPriceCents: input.monthlyPriceCents }
          : {}),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["platform-feature-modules"],
        }),
        queryClient.invalidateQueries({ queryKey: ["platform-plans"] }),
      ]);
    },
  });

  const updateTenantFlag = useMutation({
    mutationFn: (input: { key: string; enabled: boolean }) => {
      if (!token || !selectedTenantId) {
        throw new Error("Select a tenant before changing feature flags.");
      }
      return updatePlatformTenantFeatureFlag(
        token,
        selectedTenantId,
        input.key,
        input.enabled,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["platform-tenant-feature-flags", selectedTenantId],
      });
    },
  });

  function startNewPlan() {
    const firstType = availablePlanTypes[0];
    if (!firstType) return;
    setSelectedPlanId("");
    setPlanType(firstType);
    setName(firstType[0] + firstType.slice(1).toLowerCase());
    setPriceCents("0");
    setMaxOutlets("");
    setMaxUsers("");
    setMaxMonthlyOrders("");
    setIncludedModuleIds(defaultModuleIds(firstType, modules));
  }

  if (!canRead) {
    return (
      <UnavailableState
        title="Plan management access is restricted"
        description="Your platform session does not include super-admin read access."
      />
    );
  }
  if (!token) {
    return (
      <UnavailableState
        title="Platform authentication is required"
        description="Sign in with an authorized platform operator session to manage plans and modules."
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform console / commercial control"
        title="Plans & modules"
        description="Configure package limits, included modules, recurring module prices, and tenant-specific feature overrides."
        actions={
          <StatusBadge
            tone={canManagePlans || canManageFlags ? "success" : "info"}
          >
            {canManagePlans || canManageFlags ? "Manage access" : "Read only"}
          </StatusBadge>
        }
      />
      {message ? (
        <p
          role="status"
          className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm"
        >
          {message}
        </p>
      ) : null}
      {(plansQuery.isError || modulesQuery.isError) && (
        <UnavailableState
          title="Plan configuration unavailable"
          description="The plans or feature-module catalog could not be loaded. Refresh before making changes."
        />
      )}
      {plansQuery.isPending || modulesQuery.isPending ? (
        <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" />
      ) : (
        <div className="space-y-6">
          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
            <SectionHeader
              eyebrow="Package catalog"
              title="Plan configuration"
              action={
                canManagePlans && availablePlanTypes.length > 0 ? (
                  <button
                    type="button"
                    onClick={startNewPlan}
                    className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add plan
                  </button>
                ) : null
              }
            />
            {plans.length ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`rounded-xl border px-3 py-2 text-sm ${selectedPlanId === plan.id ? "border-[var(--primary)] bg-[var(--primary)]/10 font-semibold" : "border-[var(--border)]"}`}
                  >
                    {plan.name} · {currency(plan.priceCents)}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No plans configured"
                description="Create the first supported plan tier to enable tenant provisioning."
              />
            )}
            {(currentPlan || availablePlanTypes.length > 0) && (
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  savePlan.mutate();
                }}
              >
                {!currentPlan ? (
                  <label className="grid gap-2 text-sm font-medium">
                    Plan type
                    <select
                      value={planType}
                      onChange={(event) => {
                        const nextType = event.target.value as PlanType;
                        setPlanType(nextType);
                        setIncludedModuleIds(
                          defaultModuleIds(nextType, modules),
                        );
                      }}
                      disabled={!canManagePlans || savePlan.isPending}
                      className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                    >
                      {(availablePlanTypes.length
                        ? availablePlanTypes
                        : [planType]
                      ).map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="grid gap-2 text-sm font-medium">
                    Plan type
                    <p className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2">
                      {currentPlan.type}
                    </p>
                  </div>
                )}
                <label className="grid gap-2 text-sm font-medium">
                  Display name
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    readOnly={!canManagePlans}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Monthly package price (IDR)
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    value={priceCents}
                    onChange={(event) => setPriceCents(event.target.value)}
                    readOnly={!canManagePlans}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Outlet limit (blank = unlimited)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxOutlets}
                    onChange={(event) => setMaxOutlets(event.target.value)}
                    readOnly={!canManagePlans}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  User limit (blank = unlimited)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxUsers}
                    onChange={(event) => setMaxUsers(event.target.value)}
                    readOnly={!canManagePlans}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Monthly order limit (blank = unlimited)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxMonthlyOrders}
                    onChange={(event) =>
                      setMaxMonthlyOrders(event.target.value)
                    }
                    readOnly={!canManagePlans}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                  />
                </label>
                <fieldset className="grid gap-2 md:col-span-2">
                  <legend className="text-sm font-semibold">
                    Modules included in this package
                  </legend>
                  {!currentPlan ? (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      New plans start with the recommended modules for their
                      tier. You can adjust the selection before saving.
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {modules.map((module) => (
                      <label
                        key={module.id}
                        className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={includedModuleIds.includes(module.id)}
                          disabled={
                            !canManagePlans ||
                            (!module.isActive &&
                              !includedModuleIds.includes(module.id)) ||
                            savePlan.isPending
                          }
                          onChange={(event) =>
                            setIncludedModuleIds((current) =>
                              event.target.checked
                                ? [...current, module.id]
                                : current.filter((id) => id !== module.id),
                            )
                          }
                        />
                        <span className="flex-1">
                          {module.name}{" "}
                          <span className="text-[var(--muted-foreground)]">
                            ({module.key})
                          </span>
                        </span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {currency(module.monthlyPriceCents)}/mo add-on
                        </span>
                      </label>
                    ))}
                    {!modules.length ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        Create feature modules below to include them in a plan.
                      </p>
                    ) : null}
                  </div>
                </fieldset>
                {savePlan.isError ? (
                  <p
                    role="alert"
                    className="text-sm text-red-600 md:col-span-2"
                  >
                    {savePlan.error instanceof Error
                      ? savePlan.error.message
                      : "The plan could not be saved."}
                  </p>
                ) : null}
                {canManagePlans ? (
                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      disabled={savePlan.isPending}
                      className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savePlan.isPending ? "Saving..." : "Save plan"}
                    </button>
                  </div>
                ) : null}
              </form>
            )}
          </section>

          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
            <SectionHeader
              eyebrow="Recurring add-ons"
              title="Feature module catalog"
            />
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              Assign these supported modules to plans to grant API access. Core
              orders, products, payments, outlets, and Owner access are not
              controlled by this catalog.
            </p>
            {modules.length ? (
              <div className="mb-5 divide-y divide-[var(--border)]">
                {modules.map((module) => (
                  <div
                    key={module.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {module.name}{" "}
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {module.key}
                        </span>
                      </p>
                      {module.description ? (
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {module.description}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge tone={module.isActive ? "success" : "neutral"}>
                      {module.isActive ? "Available" : "Archived"}
                    </StatusBadge>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="sr-only">
                        Monthly price for {module.name}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={
                          modulePriceDrafts[module.id] ??
                          String(module.monthlyPriceCents)
                        }
                        onChange={(event) =>
                          setModulePriceDrafts((current) => ({
                            ...current,
                            [module.id]: event.target.value,
                          }))
                        }
                        readOnly={!canManageFlags}
                        className="w-32 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1"
                      />
                      <span>/month IDR</span>
                    </label>
                    {canManageFlags ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={
                            updateModule.isPending ||
                            !Number.isSafeInteger(
                              Number(
                                modulePriceDrafts[module.id] ??
                                  module.monthlyPriceCents,
                              ),
                            ) ||
                            Number(
                              modulePriceDrafts[module.id] ??
                                module.monthlyPriceCents,
                            ) < 0 ||
                            Number(
                              modulePriceDrafts[module.id] ??
                                module.monthlyPriceCents,
                            ) === module.monthlyPriceCents
                          }
                          onClick={() =>
                            updateModule.mutate({
                              id: module.id,
                              monthlyPriceCents: Number(
                                modulePriceDrafts[module.id],
                              ),
                            })
                          }
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-50"
                        >
                          Save price
                        </button>
                        <button
                          type="button"
                          disabled={updateModule.isPending}
                          onClick={() =>
                            updateModule.mutate({
                              id: module.id,
                              isActive: !module.isActive,
                            })
                          }
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold"
                        >
                          {module.isActive ? "Archive" : "Reactivate"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Module catalog is empty"
                description="Apply the feature-module catalog migration before configuring plan access."
              />
            )}
          </section>

          <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
            <SectionHeader
              eyebrow="Tenant controls"
              title="Feature flag overrides"
            />
            <p className="mb-4 text-sm text-[var(--muted-foreground)]">
              A subscribed module is enabled by default. Platform operators may
              disable it for a tenant; enabling an unpurchased module is
              blocked. Add-on changes are billed monthly and take effect at the
              next renewal.
            </p>
            {canManageFlags ? (
              <label className="mb-4 grid max-w-xl gap-2 text-sm font-medium">
                Tenant
                <select
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                  disabled={
                    tenantsQuery.isPending || activeTenants.length === 0
                  }
                  className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
                >
                  {activeTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} · {tenant.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tenantsQuery.isError || tenantFlagsQuery.isError ? (
              <p role="alert" className="text-sm text-red-600">
                Tenant feature flags could not be loaded.
              </p>
            ) : tenantFlagsQuery.isPending ? (
              <div className="h-20 animate-pulse rounded-xl bg-[var(--muted)]" />
            ) : !selectedTenantId ? (
              <EmptyState
                title="No active tenants"
                description="Create a tenant before configuring tenant-specific feature flags."
              />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {tenantFlagsQuery.data?.modules.map((module) => {
                  const entitled =
                    tenantFlagsQuery.data.entitledModuleIds.includes(module.id);
                  const override = tenantFlagsQuery.data.flags.find(
                    (flag) => flag.key === module.key,
                  );
                  const enabled = entitled && (override?.enabled ?? true);
                  return (
                    <label
                      key={module.id}
                      className="flex items-center gap-3 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={
                          !canManageFlags ||
                          !entitled ||
                          updateTenantFlag.isPending
                        }
                        onChange={(event) =>
                          updateTenantFlag.mutate({
                            key: module.key,
                            enabled: event.target.checked,
                          })
                        }
                      />
                      <span className="flex-1">
                        {module.name}{" "}
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {module.key}
                        </span>
                      </span>
                      <StatusBadge tone={entitled ? "success" : "neutral"}>
                        {entitled ? "Entitled" : "Not purchased"}
                      </StatusBadge>
                    </label>
                  );
                })}
                {tenantFlagsQuery.data?.flags
                  .filter(
                    (flag) =>
                      !tenantFlagsQuery.data.modules.some(
                        (module) => module.key === flag.key,
                      ),
                  )
                  .map((flag) => (
                    <label
                      key={flag.id}
                      className="flex items-center gap-3 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={flag.enabled}
                        disabled={!canManageFlags || updateTenantFlag.isPending}
                        onChange={(event) =>
                          updateTenantFlag.mutate({
                            key: flag.key,
                            enabled: event.target.checked,
                          })
                        }
                      />
                      <span className="flex-1">{flag.key}</span>
                      <StatusBadge tone="info">Tenant override</StatusBadge>
                    </label>
                  ))}
                {!tenantFlagsQuery.data?.modules.length ? (
                  <EmptyState
                    title="No feature modules"
                    description="Add a feature module to the catalog first."
                  />
                ) : null}
              </div>
            )}
            {updateTenantFlag.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {updateTenantFlag.error instanceof Error
                  ? updateTenantFlag.error.message
                  : "The tenant feature flag could not be updated."}
              </p>
            ) : null}
          </section>
        </div>
      )}
    </>
  );
}
