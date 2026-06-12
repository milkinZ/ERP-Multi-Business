"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";

type SaleOrderItem = {
  product: { id: string; name: string; price?: number };
  quantity: number;
  price?: number;
  subtotal?: number;
};

type SaleOrder = {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  items: SaleOrderItem[];
};

// type UpdateStatusDto = { status: string };

export default function SalesOrderDetailPage() {
  return (
    <RequireAuth>
      <SalesOrderDetailInner />
    </RequireAuth>
  );
}

function SalesOrderDetailInner() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { token } = useAuth();

  const [order, setOrder] = useState<SaleOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // const [newStatus, setNewStatus] = useState<string>('PAID');

  // const statusOptions = useMemo(() => {
  //   return ['PENDING', 'PAID', 'COMPLETED', 'CANCELLED'];
  // }, []);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<SaleOrder>(`/salesOrders/${id}`, {
          token,
        });
        setOrder(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load order");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  // async function updateStatus() {
  //   if (!token || !id) return;
  //   try {
  //     setLoading(true);
  //     setError(null);
  //     const dto: UpdateStatusDto = { status: newStatus };
  //     await apiClient.patch(`/salesOrders/${id}/status`, dto, { token });
  //     const data = await apiClient.get<SaleOrder>(`/salesOrders/${id}`, {
  //       token,
  //     });
  //     setOrder(data);
  //   } catch (e) {
  //     const err = e as { message?: string };
  //     setError(err?.message ?? 'Failed to update status');
  //   } finally {
  //     setLoading(false);
  //   }
  // }

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!order) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>
          {order.orderNumber ?? order.id}
        </h1>
        <Link href="/sales-orders" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#666" }}>Status</div>
        <div style={{ marginTop: 4 }}>{order.status}</div>

        {/* <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            style={{ padding: 10 }}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => void updateStatus()}
            style={{
              padding: '10px 12px',
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Update
          </button>
        </div> */}
      </div>

      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Items</div>
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
              Product
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
              Price
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items?.map((it, idx) => (
            <tr key={it.product.id + "-" + idx}>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {it.product?.name ?? it.product?.id}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {it.quantity}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {it.price ?? it.product?.price ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {it.subtotal ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontWeight: 700 }}>
        Total: {order.totalAmount?.toLocaleString?.() ?? order.totalAmount}
      </div>
    </div>
  );
}
