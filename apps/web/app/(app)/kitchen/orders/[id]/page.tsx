'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

import { RequireAuth } from '../../../../../src/components/RequireAuth';
import { useAuth } from '../../../../../src/providers/AuthProvider';
import { apiClient } from '../../../../../src/lib/apiClient';

type KitchenOrder = {
  id: string;
  status?: string;
  orderNumber?: string;
};

export default function KitchenOrderPage() {
  return (
    <RequireAuth>
      <KitchenOrderInner />
    </RequireAuth>
  );
}

function KitchenOrderInner() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { token } = useAuth();

  const [item, setItem] = useState<KitchenOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      setLoading(true);
      setError(null);
      try {
        // No explicit GET detail endpoint in backend controller; best-effort fallback to queue list
        const all = await apiClient.get<KitchenOrder[]>('/kitchen/orders', { token });
        setItem((all ?? []).find((o) => o.id === id) ?? null);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!item) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20 }}>Kitchen Order</h1>
        <Link href="/kitchen" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div>#{item.orderNumber ?? item.id}</div>
      <div>Status: {item.status ?? '-'}</div>
    </div>
  );
}

