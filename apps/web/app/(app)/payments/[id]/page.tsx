"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";

type Payment = {
  id: string;
  status?: string;
  amount?: number;
  createdAt?: string;
};

export default function PaymentDetailPage() {
  return (
    <RequireAuth>
      <PaymentDetailInner />
    </RequireAuth>
  );
}

function PaymentDetailInner() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { token } = useAuth();

  const [item, setItem] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Payment>(`/payments/${id}`, { token });
        setItem(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load payment");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!item) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Payment {item.id}</h1>
        <Link href="/payments" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 560 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Status</div>
            <div style={{ marginTop: 4 }}>{item.status ?? "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#666" }}>Amount</div>
            <div style={{ marginTop: 4 }}>{item.amount ?? "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
