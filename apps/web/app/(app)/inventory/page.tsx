"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "../../../src/lib/apiClient";
import { useAuth } from "../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../src/components/RequireAuth";
import Can from "../../../src/components/Can";
import { PERMISSIONS } from "../../../src/lib/permissions";

type InventoryHistoryRow = {
  id: string;
  type?: string;
  quantity?: number;
  createdAt?: string;
  inventoryItemId?: string;
};

export default function InventoryPage() {
  return (
    <RequireAuth>
      <InventoryInner />
    </RequireAuth>
  );
}

function InventoryInner() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<InventoryHistoryRow[]>([]);
  const [itemId, setItemId] = useState("");

  async function loadHistory() {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const base = "/inventory/history";
      const path = itemId ? `${base}/${itemId}` : base;

      const data = await apiClient.get<InventoryHistoryRow[]>(path, {
        token,
      });

      setHistory(data ?? []);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to load inventory history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 6 }}>Inventory</h1>
          <div style={{ fontSize: 12, color: "#666" }}>
            History & adjustments
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#666" }}>
              Inventory Item ID (optional)
            </span>
            <input
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              placeholder="e.g. uuid/ID"
              style={{ padding: 10, width: 240 }}
            />
          </label>
          <button
            onClick={() => void loadHistory()}
            style={{
              padding: "10px 12px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              height: 40,
            }}
          >
            Load
          </button>
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <Can permission={PERMISSIONS.INVENTORY_ADJUST} fallback={null}>
          <Link href="/inventory/stock-in" style={{ fontSize: 13 }}>
            + Stock In
          </Link>
          {" | "}
          <Link href="/inventory/adjustment" style={{ fontSize: 13 }}>
            + Adjustment
          </Link>
          {" | "}
          <Link href="/inventory/waste" style={{ fontSize: 13 }}>
            + Waste
          </Link>
        </Can>
      </div>

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
          {history.map((h) => (
            <tr key={h.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {h.id}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {h.type ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {h.quantity ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {h.inventoryItemId ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {h.createdAt ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        {user ? `User: ${user.roleId}` : null}
      </div>
    </div>
  );
}
