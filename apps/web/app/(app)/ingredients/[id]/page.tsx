'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';
import { ErrorAlert } from '../../../../src/components/ErrorAlert';

type Ingredient = {
  id: string;
  name?: string;
  unit?: string;
  inventoryItemId?: string | null;
};

export default function IngredientDetailPage() {
  return (
    <RequireAuth>
      <IngredientDetailInner />
    </RequireAuth>
  );
}

function IngredientDetailInner() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { token } = useAuth();

  const [item, setItem] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;

      setLoading(true);
      setError(null);

      try {
        const data = await apiClient.get<Ingredient>(`/ingredients/${id}`, { token });
        setItem(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load ingredient');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  if (loading) return <div>Loading...</div>;
  if (error) return <ErrorAlert message={error} />;
  if (!item) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>{item.name ?? item.id}</h1>
        <Link href="/ingredients" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>ID</div>
          <div>{item.id}</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Unit</div>
          <div>{item.unit ?? '-'}</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Inventory Item ID</div>
          <div>{item.inventoryItemId ?? '-'}</div>
        </div>
      </div>
    </div>
  );
}

