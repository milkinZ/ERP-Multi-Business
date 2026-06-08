'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';
import { ErrorAlert } from '../../../../src/components/ErrorAlert';

type Warehouse = {
  id: string;
  code?: string;
  name: string;
  outletId?: string | null;
  outlet?: { id: string; name?: string } | null;
};

export default function WarehouseDetailPage() {
  return (
    <RequireAuth>
      <WarehouseDetailInner />
    </RequireAuth>
  );
}

function WarehouseDetailInner() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { token } = useAuth();

  const [item, setItem] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Warehouse>(`/warehouses/${id}`, { token });
        setItem(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load warehouse');
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
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>{item.name}</h1>
        <Link href="/warehouses" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>ID</div>
          <div>{item.id}</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Code</div>
          <div>{item.code ?? '-'}</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Outlet</div>
          <div>
            {item.outlet?.name ?? item.outletId ?? '-'}
          </div>
        </div>
      </div>

      {/* Backend currently has no update/delete for warehouses. */}
    </div>
  );
}

