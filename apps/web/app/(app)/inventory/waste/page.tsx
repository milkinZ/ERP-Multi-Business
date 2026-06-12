"use client";

import React, { useState } from "react";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { FormButton } from "../../../../src/components/FormButton";
import Can from "../../../../src/components/Can";
import { PERMISSIONS } from "../../../../src/lib/permissions";

export default function InventoryWastePage() {
  return (
    <RequireAuth>
      <InventoryWasteInner />
    </RequireAuth>
  );
}

function InventoryWasteInner() {
  const { token } = useAuth();

  const [inventoryItemId, setInventoryItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!inventoryItemId) throw new Error("inventoryItemId is required");
      if (!warehouseId) throw new Error("warehouseId is required");
      if (!quantity || quantity <= 0) throw new Error("quantity must be > 0");

      await apiClient.post(
        "/inventory/waste",
        {
          inventoryItemId,
          warehouseId,
          quantity,
          note: note || undefined,
        },
        { token },
      );

      setSuccess("Waste recorded");
      setInventoryItemId("");
      setWarehouseId("");
      setQuantity(0);
      setNote("");
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to submit waste");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Inventory Waste</h1>

      <Can
        permission={PERMISSIONS.INVENTORY_ADJUST}
        fallback={<div>Forbidden</div>}
      >
        <div style={{ maxWidth: 520 }}>
          <label style={{ display: "block", marginBottom: 10 }}>
            Inventory Item ID
            <input
              value={inventoryItemId}
              onChange={(e) => setInventoryItemId(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder="uuid/ID"
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Warehouse ID
            <input
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder="uuid/ID"
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Quantity
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder="0"
            />
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder="optional"
            />
          </label>

          {error ? (
            <div style={{ color: "red", marginBottom: 10 }}>{error}</div>
          ) : null}
          {success ? (
            <div style={{ color: "green", marginBottom: 10 }}>{success}</div>
          ) : null}

          <FormButton disabled={loading} onClick={() => void submit()}>
            {loading ? "Submitting..." : "Submit Waste"}
          </FormButton>
        </div>
      </Can>
    </div>
  );
}
