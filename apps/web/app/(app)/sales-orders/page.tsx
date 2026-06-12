"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { apiClient } from "../../../src/lib/apiClient";
import { RequireAuth } from "../../../src/components/RequireAuth";
import { useAuth } from "../../../src/providers/AuthProvider";

type OrderStatus = string;

type SaleOrder = {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt?: string;
};

export default function SalesOrdersPage() {
  return (
    <RequireAuth>
      <SalesOrdersInner />
    </RequireAuth>
  );
}

function SalesOrdersInner() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<SaleOrder[]>("/salesOrders", {
          token,
        });
        setOrders(data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load sales orders");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Sales Orders</h1>
        <Link href="/sales-orders/new" style={{ fontSize: 13 }}>
          + New
        </Link>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: "red" }}>{error}</div> : null}

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
              Order ID
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Order Number
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
          {orders.map((o) => (
            <tr key={o.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                <Link href={`/sales-orders/${o.id}`}>{o.id}</Link>
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                <Link href={`/sales-orders/${o.id}`}>{o.orderNumber}</Link>
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {o.status}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {o.totalAmount?.toLocaleString?.() ?? o.totalAmount}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                <Link href={`/sales-orders/${o.id}`} style={{ fontSize: 13 }}>
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
