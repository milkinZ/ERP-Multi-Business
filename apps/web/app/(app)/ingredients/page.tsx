'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../src/components/RequireAuth';
import { apiClient } from '../../../src/lib/apiClient';

type Ingredient = {
  id: string;
  name?: string;
};

export default function IngredientsPage() {
  return (
    <RequireAuth>
      <IngredientsInner />
    </RequireAuth>
  );
}

function IngredientsInner() {
  const { token } = useAuth();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<Ingredient[]>('/ingredients', { token });
        setItems(data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load ingredients');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Ingredients</h1>
        <Link href="/ingredients/new" style={{ fontSize: 13 }}>
          + New
        </Link>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: 'red' }}>{error}</div> : null}

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/ingredients/${p.id}`}>{p.name ?? p.id}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

