'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiClient } from '../../../src/lib/apiClient';
import { useAuth } from '../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../src/components/RequireAuth';

type Payment = {
  id: string;
  status?: string;
  amount?: number;
  createdAt?: string;
};

export default function PaymentsPage() {
  return (
    <RequireAuth>
      <PaymentsInner />
    </RequireAuth>
  );
}

function PaymentsInner() {
  const { token } = useAuth();
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Payment[]>('/payments', { token });
        setItems(data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20 }}>Payments</h1>
        <Link href="/payments/pay" style={{ fontSize: 13 }}>
          + Pay
        </Link>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: 'red' }}>{error}</div> : null}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>ID</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Status</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Amount</th>
            <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                <Link href={`/payments/${p.id}`}>{p.id}</Link>
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{p.status ?? '-'}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{p.amount ?? '-'}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                <Link href={`/payments/${p.id}`} style={{ fontSize: 13 }}>
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

