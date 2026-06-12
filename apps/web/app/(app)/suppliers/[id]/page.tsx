"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { ErrorAlert } from "../../../../src/components/ErrorAlert";

type Supplier = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

export default function SupplierDetailPage() {
  return (
    <RequireAuth>
      <SupplierDetailInner />
    </RequireAuth>
  );
}

function SupplierDetailInner() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { token } = useAuth();

  const [item, setItem] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Supplier>(`/suppliers/${id}`, {
          token,
        });
        setItem(data);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load supplier");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  async function remove() {
    if (!token || !id) return;
    try {
      setLoading(true);
      setError(null);
      await apiClient.del(`/suppliers/${id}`, { token });
      window.location.href = "/suppliers";
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to delete supplier");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!item) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>{item.name}</h1>
        <Link href="/suppliers" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>ID</div>
          <div>{item.id}</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Phone</div>
          <div>{item.phone ?? "-"}</div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Email</div>
          <div>{item.email ?? "-"}</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#666" }}>Address</div>
          <div>{item.address ?? "-"}</div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 16,
            alignItems: "center",
          }}
        >
          <button
            onClick={() => void remove()}
            style={{
              padding: "10px 12px",
              background: "#fff",
              color: "#b00020",
              border: "1px solid #b00020",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
