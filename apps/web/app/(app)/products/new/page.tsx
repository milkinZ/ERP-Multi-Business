'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';
import { ErrorAlert } from '../../../../src/components/ErrorAlert';

export default function NewProductPage() {
  return (
    <RequireAuth>
      <NewProductInner />
    </RequireAuth>
  );
}

function NewProductInner() {
  const { token } = useAuth();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit() {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      await apiClient.post('/products',
        {
          name,
          price: price ? Number(price) : undefined,
          description: description || undefined,
        },
        { token },
      );

      setSuccess(true);
      setTimeout(() => (window.location.href = '/products'), 500);
    } catch (e) { const err = e as { message?: string };
      setError(err?.message ?? 'Failed to create product');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>New Product</h1>
        <Link href="/products" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      {error ? <ErrorAlert message={error} /> : null}
      {success ? (
        <div style={{ background: '#e9ffe9', border: '1px solid #8fda8f', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          Created. Redirecting...
        </div>
      ) : null}

      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ padding: 10 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Price
          <input value={price} onChange={(e) => setPrice(e.target.value)} style={{ padding: 10 }} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ padding: 10, minHeight: 90 }} />
        </label>

        <button
          onClick={() => void onSubmit()}
          disabled={loading}
          style={{
            padding: 12,
            background: loading ? '#999' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

