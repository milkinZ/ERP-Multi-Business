"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "../../../src/lib/apiClient";
import { useAuth } from "../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../src/components/RequireAuth";

type PurchaseOrderStatus = string;

type PurchaseOrder = {
  id: string;
  orderNumber?: string;
  status?: PurchaseOrderStatus;
  supplierId?: string;
  totalAmount?: number;
  createdAt?: string;
};

type PurchaseOrdersResponse = {
  data: PurchaseOrder[];
  pagination: {
    total: number;
    skip: number;
    take: number;
    pages: number;
  };
};

export default function PurchaseOrdersPage() {
  return (
    <RequireAuth>
      <PurchaseOrdersInner />
    </RequireAuth>
  );
}

function PurchaseOrdersInner() {
  const { token } = useAuth();

  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<PurchaseOrderStatus | "">("");
  const [supplierId, setSupplierId] = useState("");

  console.log(items);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);

        const data = await apiClient.get<PurchaseOrdersResponse>(
          "/purchase-orders",
          {
            token,
            query: {
              status: status || undefined,
              supplierId: supplierId || undefined,
              skip: 0,
              take: 10,
            },
          },
        );

        setItems(data?.data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load purchase orders");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, status, supplierId]);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Purchase Orders</h1>

      <div
        style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          Status
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="PAID/APPROVED/..."
            style={{ padding: 10, width: 220 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          Supplier ID
          <input
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            placeholder="uuid/ID"
            style={{ padding: 10, width: 220 }}
          />
        </label>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: "red" }}>{error}</div> : null}

      <div style={{ marginBottom: 12 }}>
        <Link href="/purchase-orders/new" style={{ fontSize: 13 }}>
          + New
        </Link>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Order
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Status
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Supplier
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Total
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                <Link href={`/purchase-orders/${o.id}`}>
                  {o.orderNumber ?? o.id}
                </Link>
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {o.status ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {o.supplierId ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {o.totalAmount ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                <Link
                  href={`/purchase-orders/${o.id}`}
                  style={{ fontSize: 13 }}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
