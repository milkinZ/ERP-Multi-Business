'use client';

import React, { useEffect, useState } from 'react';
import Can from '../../../src/components/Can';
import { RequireAuth } from '../../../src/components/RequireAuth';
import { apiClient } from '../../../src/lib/apiClient';
import { PERMISSIONS } from '../../../src/lib/permissions';
import { useAuth } from '../../../src/providers/AuthProvider';
import Link from 'next/link';

type KitchenOrder = {
  id: string;
  status?: string;
  orderNumber?: string;
};

export default function KitchenPage() {
  return (
    <RequireAuth>
      <KitchenInner />
    </RequireAuth>
  );
}

function KitchenInner() {
  const { token } = useAuth();
  const [items, setItems] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<KitchenOrder[]>('/kitchen/orders', { token });
      setItems(data ?? []);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to load kitchen queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function patch(action: 'start' | 'ready' | 'complete', id: string) {
    if (!token) return;
    setBusyId(id);
    try {
      await apiClient.patch(`/kitchen/orders/${id}/${action}`, undefined, { token });
      await load();
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? `Failed to ${action} order`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Kitchen Queue</h1>

      <Can permission={PERMISSIONS.KITCHEN_READ} fallback={<div>Forbidden</div>}>
        {loading ? <div>Loading...</div> : null}
        {error ? <div style={{ color: 'red', marginBottom: 12 }}>{error}</div> : null}

        {!loading && !error ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Order</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Status</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    <Link href={`/sales-orders/${o.id}`}>{o.orderNumber ?? o.id}</Link>
                  </td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{o.status ?? '-'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>
                    <div className='text-black' style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Can permission={PERMISSIONS.KITCHEN_UPDATE} fallback={null}>
                        <button
                          disabled={busyId === o.id}
                          onClick={() => void patch('start', o.id)}
                          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
                        >
                          Start
                        </button>
                        <button
                          disabled={busyId === o.id}
                          onClick={() => void patch('ready', o.id)}
                          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
                        >
                          Ready
                        </button>
                        <button
                          disabled={busyId === o.id}
                          onClick={() => void patch('complete', o.id)}
                          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', background: '#fff' }}
                        >
                          Complete
                        </button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Can>
    </div>
  );
}

