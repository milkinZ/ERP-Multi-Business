'use client';

import React, { useEffect, useState } from 'react';

import Can from '../../../src/components/Can';
import { RequireAuth } from '../../../src/components/RequireAuth';
import { apiClient } from '../../../src/lib/apiClient';
import { PERMISSIONS } from '../../../src/lib/permissions';
import { useAuth } from '../../../src/providers/AuthProvider';

type AnalyticsSummary = {
  totalProducts: number;
  totalOrders: number;
  totalPayments: number;
  totalRevenue: number;
};

type TopProduct = {
  productId: string;
  name: string;
  qtySold: number;
};

export default function AnalyticsPage() {
  return (
    <RequireAuth>
      <AnalyticsInner />
    </RequireAuth>
  );
}

function AnalyticsInner() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [s, t] = await Promise.all([
          apiClient.get<AnalyticsSummary>('/analytics/summary', { token }),
          apiClient.get<TopProduct[]>('/analytics/top-products', { token }),
        ]);
        setSummary(s);
        setTopProducts(t ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  console.log(topProducts);

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Analytics</h1>

      <Can permission={PERMISSIONS.ANALYTICS_READ} fallback={<div>Forbidden</div>}>
        {loading ? <div>Loading...</div> : null}
        {error ? <div style={{ color: 'red', marginBottom: 12 }}>{error}</div> : null}

        {!loading && !error && summary ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Total Products</div>
              <div style={{ fontSize: 20, marginTop: 6 }}>{summary.totalProducts}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Total Orders</div>
              <div style={{ fontSize: 20, marginTop: 6 }}>{summary.totalOrders}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Total Payments</div>
              <div style={{ fontSize: 20, marginTop: 6 }}>{summary.totalPayments}</div>
            </div>
            <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: '#666' }}>Total Revenue</div>
              <div style={{ fontSize: 20, marginTop: 6 }}>
                {summary.totalRevenue.toLocaleString?.() ?? summary.totalRevenue}
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error ? (
          <div>
            <h2 style={{ fontSize: 16, marginBottom: 10 }}>Top Products</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Product</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Qty Sold</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{p.name ?? p.productId}</td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{p.qtySold}</td>
                  </tr>
                ))}
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ padding: 8, color: '#666' }}>
                      No data
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </Can>
    </div>
  );
}

