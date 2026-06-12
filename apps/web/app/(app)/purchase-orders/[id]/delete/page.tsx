"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "../../../../../src/lib/apiClient";
import { useAuth } from "../../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../../src/components/RequireAuth";
import { ErrorAlert } from "../../../../../src/components/ErrorAlert";

type PurchaseOrder = {
  id: string;
  orderNumber?: string;
  status?: string;
};

export default function PurchaseOrderDeletePage() {
  return (
    <RequireAuth>
      <PurchaseOrderDeleteInner />
    </RequireAuth>
  );
}

function PurchaseOrderDeleteInner() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [order, setOrder] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    if (!token || !id) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<PurchaseOrder>(
          `/purchase-orders/${id}`,
          {
            token,
          },
        );
        setOrder(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load purchase order");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  async function doDelete() {
    if (!token || !id) return;
    setSubmitting(true);
    setError(null);

    try {
      await apiClient.del(`/purchase-orders/${id}`, { token });
      window.location.href = "/purchase-orders";
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to delete purchase order");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <ErrorAlert message={error} />;

  if (!order) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>
          Delete Purchase Order
        </h1>
        <Link href={`/purchase-orders/${id}`} style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div
        style={{
          marginBottom: 12,
          padding: 12,
          border: "1px solid #ffccd1",
          background: "#fff5f5",
          borderRadius: 8,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Are you sure?</div>
        <div style={{ fontSize: 13, color: "#666" }}>
          Deletion is allowed only when PO status is <b>DRAFT</b>. This action
          will soft-delete the record.
        </div>
      </div>

      <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        PO: {order.orderNumber ?? order.id} (status: {order.status ?? "-"})
      </div>

      {error ? <ErrorAlert message={error} /> : null}

      <button
        type="button"
        onClick={() => void doDelete()}
        disabled={submitting}
        style={{
          padding: "12px 14px",
          width: "100%",
          background: submitting ? "#999" : "#b00020",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: submitting ? "not-allowed" : "pointer",
          fontWeight: 700,
        }}
      >
        {submitting ? "Deleting..." : "Delete PO"}
      </button>
    </div>
  );
}
