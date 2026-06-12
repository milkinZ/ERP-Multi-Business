"use client";

import React, { useState } from "react";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { FormButton } from "../../../../src/components/FormButton";
import Can from "../../../../src/components/Can";
import { PERMISSIONS } from "../../../../src/lib/permissions";

export default function InventoryStockInPage() {
  return (
    <RequireAuth>
      <InventoryStockInInner />
    </RequireAuth>
  );
}

function InventoryStockInInner() {
  const { token } = useAuth();

  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [warehouseId, setWarehouseId] = useState("");

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
      if (quantity <= 0) throw new Error("quantity must be > 0");

      // Backend DTO is StockInDto: inventoryItemId, quantity, unitPrice?
      // We follow best-effort names based on DTO usage.
      await apiClient.post(
        "/inventory/stock-in",
        {
          inventoryItemId,
          quantity,
          warehouseId,
        },
        { token },
      );

      setSuccess("Stock-in submitted");
      setInventoryItemId("");
      setQuantity(0);
      setWarehouseId("");
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to submit stock-in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Stock In</h1>

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
            Warehouse ID
            <input
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              placeholder="uuid/ID"
            />
          </label>

          {error ? (
            <div style={{ color: "red", marginBottom: 10 }}>{error}</div>
          ) : null}
          {success ? (
            <div style={{ color: "green", marginBottom: 10 }}>{success}</div>
          ) : null}

          <FormButton disabled={loading} onClick={() => void submit()}>
            {loading ? "Submitting..." : "Submit Stock In"}
          </FormButton>
        </div>
      </Can>
    </div>
  );
}
