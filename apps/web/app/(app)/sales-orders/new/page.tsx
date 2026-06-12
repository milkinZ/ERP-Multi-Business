"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { apiClient } from "../../../../src/lib/apiClient";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { ErrorAlert } from "../../../../src/components/ErrorAlert";

type Product = {
  id: string;
  name?: string;
  price?: number;
};

type ItemForm = {
  productId: string;
  quantity: string; // keep string for <input>
};

type CreateSalesOrderForm = {
  items: ItemForm[];
};

export default function SalesOrderCreatePage() {
  return (
    <RequireAuth>
      <SalesOrderCreateInner />
    </RequireAuth>
  );
}

function SalesOrderCreateInner() {
  const { token } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<CreateSalesOrderForm>({
    items: [{ productId: "", quantity: "1" }],
  });

  useEffect(() => {
    (async () => {
      if (!token) return;

      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<Product[]>("/products", { token });
        setProducts(data ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load products");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function setItemAt(idx: number, patch: Partial<ItemForm>) {
    setForm((s) => {
      const items = [...s.items];
      items[idx] = {
        ...items[idx],
        ...(patch as ItemForm),
      };
      return { ...s, items };
    });
  }

  function addItem() {
    setForm((s) => ({
      ...s,
      items: [...s.items, { productId: "", quantity: "1" }],
    }));
  }

  function removeItem(idx: number) {
    setForm((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  }

  async function submit() {
    if (!token) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const itemsPayload = form.items
        .filter((it) => it.productId && it.quantity)
        .map((it) => {
          const quantity = Number(it.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error("quantity must be > 0");
          }

          return {
            productId: it.productId,
            quantity,
          };
        });

      if (itemsPayload.length === 0) {
        throw new Error("At least one valid item is required");
      }

      await apiClient.post(
        "/salesOrders",
        {
          items: itemsPayload,
        },
        { token },
      );

      setSuccess("Sales order created");
      window.location.href = "/sales-orders";
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to create sales order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>New Sales Order</h1>
        <Link href="/sales-orders" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      {error ? <ErrorAlert message={error} /> : null}
      {success ? (
        <div style={{ color: "green", marginBottom: 12 }}>{success}</div>
      ) : null}

      {loading ? <div>Loading...</div> : null}

      {!loading ? (
        <div
          style={{
            maxWidth: 720,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <div style={{ marginBottom: 8, fontWeight: 700 }}>Items</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {form.items.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    border: "1px solid #e5e5e5",
                    borderRadius: 8,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                  }}
                >
                  <label
                    style={{
                      flex: "1 1 260px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    Product
                    <select
                      value={it.productId}
                      onChange={(e) =>
                        setItemAt(idx, { productId: e.target.value })
                      }
                      style={{ padding: 10 }}
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ?? p.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    style={{
                      flex: "0 0 140px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    Quantity
                    <input
                      type="number"
                      value={it.quantity}
                      onChange={(e) =>
                        setItemAt(idx, { quantity: e.target.value })
                      }
                      style={{ padding: 10 }}
                      min={1}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #b00020",
                      background: "#fff",
                      color: "#b00020",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    disabled={form.items.length <= 1}
                    title={
                      form.items.length <= 1
                        ? "At least one item required"
                        : "Remove"
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={addItem}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                + Add item
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            style={{
              width: "100%",
              padding: 12,
              background: submitting ? "#999" : "#111",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Submitting..." : "Create Sales Order"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
