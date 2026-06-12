"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "../../../src/lib/apiClient";
import { useAuth } from "../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../src/components/RequireAuth";

type Product = {
  id: string;
  name: string;
};

export default function ProductsPage() {
  return (
    <RequireAuth>
      <ProductsInner />
    </RequireAuth>
  );
}

function ProductsInner() {
  const { token } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Product[]>("/products", {
          token,
        });
        setItems(data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load products");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Products</h1>
        <Link href="/products/new" style={{ fontSize: 13 }}>
          + New
        </Link>
      </div>

      {loading ? <div>Loading...</div> : null}
      {error ? <div style={{ color: "red" }}>{error}</div> : null}

      <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${p.id}`}>{p.name ?? p.id}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
