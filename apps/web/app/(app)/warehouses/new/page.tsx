'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';
import { ErrorAlert } from '../../../../src/components/ErrorAlert';

type WarehouseForm = {
  name: string;
  outletId?: string;
};

// Note: backend supports outletId optional. If you don't have an outlet selector API on frontend,
// we keep outletId free-text.
export default function NewWarehousePage() {
  return (
    <RequireAuth>
      <NewWarehouseInner />
    </RequireAuth>
  );
}

function NewWarehouseInner() {
  const { token } = useAuth();

  const [form, setForm] = useState<WarehouseForm>({ name: '', outletId: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit() {
    if (!token) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const payload: any = {
        name: form.name,
      };
      if (form.outletId) payload.outletId = form.outletId;

      await apiClient.post('/warehouses', payload, { token });

      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/warehouses';
      }, 500);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to create warehouse');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>New Warehouse</h1>
        <Link href="/warehouses" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      {error ? <ErrorAlert message={error} /> : null}
      {success ? (
        <div
          style={{
            background: '#e9ffe9',
            border: '1px solid #8fda8f',
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          Created. Redirecting...
        </div>
      ) : null}

      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          Outlet ID (optional)
          <input
            value={form.outletId ?? ''}
            onChange={(e) => setForm((s) => ({ ...s, outletId: e.target.value }))}
            style={{ padding: 10 }}
            placeholder="UUID or outlet id"
          />
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

