"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/client";
import {
  createKitchenStation,
  kitchenKeys,
  updateKitchenStation,
  type KitchenOutlet,
  type KitchenStation,
} from "@/features/erp/kitchen/api/queries";

function parseCategories(value: string) {
  return [
    ...new Set(
      value
        .split(",")
        .map((category) => category.trim())
        .filter(Boolean),
    ),
  ];
}

function StationEditor({
  station,
  accessToken,
  onSaved,
}: {
  station: KitchenStation;
  accessToken: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(station.name);
  const [categories, setCategories] = useState(
    station.Categories.map((category) => category.category).join(", "),
  );
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      updateKitchenStation(accessToken, station.id, {
        name: name.trim(),
        categories: parseCategories(categories),
        isActive: station.isActive,
        displayOrder: station.displayOrder,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to update station.",
      );
    },
  });
  const activationMutation = useMutation({
    mutationFn: () =>
      updateKitchenStation(accessToken, station.id, {
        isActive: !station.isActive,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to update station status.",
      );
    },
  });

  return (
    <form
      className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[1fr_2fr_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="text-xs font-medium text-muted-foreground">
        Station name
        <input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </label>
      <label className="text-xs font-medium text-muted-foreground">
        Routed categories (comma separated)
        <input
          value={categories}
          maxLength={1000}
          required
          onChange={(event) => setCategories(event.target.value)}
          className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        />
      </label>
      <button
        type="submit"
        disabled={
          mutation.isPending ||
          !name.trim() ||
          !parseCategories(categories).length
        }
        className="self-end rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
      >
        {mutation.isPending ? "Saving..." : "Save"}
      </button>
      <button
        type="button"
        disabled={activationMutation.isPending}
        onClick={() => activationMutation.mutate()}
        className="self-end rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
      >
        {activationMutation.isPending
          ? "Updating..."
          : station.isActive
            ? "Deactivate"
            : "Activate"}
      </button>
      {error ? (
        <p role="alert" className="text-xs text-destructive md:col-span-3">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground md:col-span-3">
        {station.isActive ? "Active" : "Inactive"} · {station.Categories.length}{" "}
        routing categories
      </p>
    </form>
  );
}

export function KitchenStationManager({
  tenantId,
  accessToken,
  outlets,
  stations,
  canUpdate,
}: {
  tenantId: string;
  accessToken: string;
  outlets: KitchenOutlet[];
  stations: KitchenStation[];
  canUpdate: boolean;
}) {
  const queryClient = useQueryClient();
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "");
  const [name, setName] = useState("");
  const [categories, setCategories] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!outlets.some((outlet) => outlet.id === outletId)) {
      setOutletId(outlets[0]?.id ?? "");
    }
  }, [outletId, outlets]);

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: kitchenKeys.stations(tenantId),
    });
  };
  const createMutation = useMutation({
    mutationFn: () => {
      if (!outletId) throw new Error("Select an outlet.");
      return createKitchenStation(accessToken, {
        outletId,
        name: name.trim(),
        categories: parseCategories(categories),
        displayOrder: stations.length,
      });
    },
    onSuccess: async () => {
      setName("");
      setCategories("");
      setError(null);
      await refresh();
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to create station.",
      );
    },
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">
        Stations and category routing
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each category maps to one active station at an outlet. New tickets
        snapshot the route when they are released.
      </p>
      {canUpdate ? (
        <form
          className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[1fr_1fr_2fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            createMutation.mutate();
          }}
        >
          <label className="text-xs font-medium text-muted-foreground">
            Outlet
            <select
              value={outletId}
              onChange={(event) => setOutletId(event.target.value)}
              required
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">Select outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Station
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Product categories
            <input
              value={categories}
              onChange={(event) => setCategories(event.target.value)}
              placeholder="coffee, espresso"
              maxLength={1000}
              required
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={
              createMutation.isPending ||
              !outletId ||
              !name.trim() ||
              !parseCategories(categories).length
            }
            className="self-end rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Add station"}
          </button>
          {error ? (
            <p role="alert" className="text-xs text-destructive md:col-span-4">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      <div className="mt-4 space-y-3">
        {stations.length ? (
          stations.map((station) => (
            <StationEditor
              key={station.id}
              station={station}
              accessToken={accessToken}
              onSaved={() => void refresh()}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No Kitchen stations are configured yet.
          </p>
        )}
      </div>
    </section>
  );
}
