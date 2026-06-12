"use client";

import React, { useEffect, useState } from "react";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";

type InventoryHistoryRow = {
  id: string;
  type?: string;
  quantity?: number;
  createdAt?: string;
  inventoryItemId?: string;
};

type InventoryHistoryResponse = InventoryHistoryRow[];

export default function InventoryHistoryPage() {
  return (
    <RequireAuth>
      <InventoryHistoryInner />
    </RequireAuth>
  );
}

function InventoryHistoryInner() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryHistoryResponse>([]);

  useEffect(() => {
    async function run() {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<InventoryHistoryResponse>(
          "/inventory/history",
          {
            token,
          },
        );
        setRows(data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load history");
      } finally {
        setLoading(false);
      }
    }

    void run();
  }, [token]);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Inventory History</h1>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: "red" }}>{error}</div> : null}

      <table
        style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              ID
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Type
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Qty
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Item
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {r.id}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {r.type ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {r.quantity ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {r.inventoryItemId ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {r.createdAt ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
