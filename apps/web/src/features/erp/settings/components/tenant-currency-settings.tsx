"use client";

import React from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/data-display/states";
import { ApiError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import {
  getTenantSettings,
  tenantSettingsKeys,
  updateTenantSettings,
} from "@/features/erp/settings/api/queries";
import { useAuthStore } from "@/stores/auth.store";

export function TenantCurrencySettings() {
  const token = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const tenantId = session?.tenantId;
  const canRead = hasPermission(session, "business.read");
  const canUpdate = hasPermission(session, "business.update");
  const queryClient = useQueryClient();
  const [currencyCode, setCurrencyCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: tenantId
      ? tenantSettingsKeys.detail(tenantId)
      : ["tenant-settings", "unauthenticated"],
    queryFn: () => getTenantSettings(token as string, tenantId as string),
    enabled: Boolean(token && tenantId && canRead),
  });

  useEffect(() => {
    setCurrencyCode(query.data?.currencyCode ?? "");
  }, [query.data?.currencyCode]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!token || !tenantId) throw new Error("Tenant session is required");
      return updateTenantSettings(token, tenantId, {
        currencyCode: currencyCode.trim().toUpperCase(),
      });
    },
    retry: 0,
    onSuccess: async (tenant) => {
      if (tenantId) {
        await queryClient.invalidateQueries({
          queryKey: tenantSettingsKeys.detail(tenantId),
        });
      }
      setCurrencyCode(tenant.currencyCode ?? "");
      setMessage("Base currency saved.");
    },
    onError: (cause) => {
      setMessage(
        cause instanceof ApiError && cause.status === 409
          ? "Base currency is locked because this tenant already has financial transactions."
          : cause instanceof Error
            ? cause.message
            : "Unable to save base currency.",
      );
    },
  });

  if (!canRead) {
    return (
      <UnavailableState
        title="Tenant settings access is restricted"
        description="Your session does not include business.read."
      />
    );
  }
  if (query.isPending) {
    return <div className="h-36 animate-pulse rounded-3xl bg-muted" />;
  }
  if (query.isError) {
    return (
      <UnavailableState
        title="Unable to load tenant settings"
        description="The tenant settings API could not be reached. No settings were changed."
      />
    );
  }

  const isUnchanged =
    currencyCode.trim().toUpperCase() === (query.data.currencyCode ?? "");

  return (
    <section className="max-w-2xl space-y-5 rounded-3xl border border-border bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Base currency
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure one ISO 4217 currency for tenant sales and purchasing.
          Orders and purchase orders keep a currency snapshot for reporting.
        </p>
      </div>
      <label className="block text-sm font-medium text-foreground">
        ISO 4217 currency code
        <input
          value={currencyCode}
          onChange={(event) => setCurrencyCode(event.target.value)}
          disabled={!canUpdate || mutation.isPending}
          maxLength={3}
          autoCapitalize="characters"
          placeholder="IDR"
          aria-describedby="tenant-currency-help"
          className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 uppercase outline-none focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-60"
        />
      </label>
      <p id="tenant-currency-help" className="text-xs text-muted-foreground">
        {query.data.currencyCode
          ? "Existing transactions keep their original currency snapshot. The API rejects currency changes when financial history exists."
          : "Configure this before creating new sales orders or purchase orders. Existing transactions stay unchanged; after initial setup, currency changes are blocked when financial history exists."}
      </p>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
      {canUpdate ? (
        <Button
          type="button"
          disabled={
            mutation.isPending ||
            !currencyCode.trim() ||
            isUnchanged
          }
          onClick={() => {
            setMessage(null);
            mutation.mutate();
          }}
        >
          {mutation.isPending ? "Saving..." : "Save base currency"}
        </Button>
      ) : null}
    </section>
  );
}
