'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiClient } from '../../../../../src/lib/apiClient';
import { useAuth } from '../../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../../src/components/RequireAuth';
import { ErrorAlert } from '../../../../../src/components/ErrorAlert';

type PurchaseOrderItem = {
  product?: { id: string; name: string };
  quantity?: number;
  price?: number;
  subtotal?: number;
};

type PurchaseOrder = {
  id: string;
  orderNumber?: string;
  status?: string;
  supplierId?: string;
  items?: PurchaseOrderItem[];
  totalAmount?: number;
};

export default function PurchaseOrderDetailPage() {
  return (
    <RequireAuth>
      <PurchaseOrderDetailInner />
    </RequireAuth>
  );
}

function PurchaseOrderDetailInner() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { token } = useAuth();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = useMemo(() => {
    return [
      'DRAFT',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'PARTIALLY_RECEIVED',
      'RECEIVED',
      'COMPLETED',
      'CANCELLED',
    ];
  }, []);

  const [nextStatus, setNextStatus] = useState(statusOptions[0]);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<PurchaseOrder>(
          `/purchase-orders/${id}`,
          { token },
        );
        setOrder(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load purchase order');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  async function updateStatus() {
    if (!token || !id) return;
    try {
      setLoading(true);
      setError(null);
      await apiClient.patch(
        `/purchase-orders/${id}/status`,
        { status: nextStatus },
        { token },
      );
      const data = await apiClient.get<PurchaseOrder>(
        `/purchase-orders/${id}`,
        { token },
      );
      setOrder(data);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to update purchase order status');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <ErrorAlert message={error} />;
  if (!order) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>
          {order.orderNumber ?? order.id}
        </h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/purchase-orders" style={{ fontSize: 13 }}>
            ← Back
          </Link>
          <Link href={`/purchase-orders/${order.id}/edit`} style={{ fontSize: 13 }}>
            Edit
          </Link>
          <Link href={`/purchase-orders/${order.id}/delete`} style={{ fontSize: 13, color: '#b00020' }}>
            Delete
          </Link>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666' }}>Status</div>
        <div style={{ marginTop: 4 }}>{order.status ?? '-'}</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <select
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
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
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Items</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Product
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Qty
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Price
            </th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {(order.items ?? []).map((it, idx) => (
            <tr key={(it.product?.id ?? 'x') + '-' + idx}>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {it.product?.name ?? it.product?.id ?? '-'}
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {it.quantity ?? '-'}
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {it.price ?? '-'}
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                {it.subtotal ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, fontWeight: 700 }}>
        Total: {order.totalAmount ?? '-'}
      </div>
    </div>
  );
}

