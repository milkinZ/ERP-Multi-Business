'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';

type Product = {
  id: string;
  name: string;
  price?: number;
  description?: string | null;
  inventoryItemId?: string | null;
};

export default function ProductDetailPage() {
  return (
    <RequireAuth>
      <ProductDetailInner />
    </RequireAuth>
  );
}

function ProductDetailInner() {
  const params = useParams();
  const { token } = useAuth();
  const id = String(params.id ?? '');

  const [item, setItem] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Product>(`/products/${id}`, {
          token,
        });
        setItem(data);
    } catch (e) { const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load product');
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
        <Link href="/products" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>ID</div>
          <div>{item.id}</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Price</div>
          <div>{item.price ?? '-'}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Description</div>
          <div>{item.description ?? '-'}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#666' }}>Inventory Item ID</div>
          <div>{item.inventoryItemId ?? '-'}</div>
        </div>
      </div>
    </div>
  );
}

