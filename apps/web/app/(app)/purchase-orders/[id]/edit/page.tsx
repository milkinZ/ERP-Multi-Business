"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "../../../../../src/lib/apiClient";
import { useAuth } from "../../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../../src/components/RequireAuth";
import { ErrorAlert } from "../../../../../src/components/ErrorAlert";

type Supplier = { id: string; name?: string };

type Warehouse = { id: string; name?: string };

type InventoryItem = { id: string; name?: string; unit?: string };

type UpdatePoItem = {
  id?: string;
  inventoryItemId?: string;
  quantity?: number;
  unitPrice?: number;
};

type UpdatePoForm = {
  supplierId: string;
  warehouseId: string;
  expectedDeliveryDate: string;
  notes: string;
  items: UpdatePoItem[];
};

function toNumberOrUndefined(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function PurchaseOrderEditPage() {
  return (
    <RequireAuth>
      <PurchaseOrderEditInner />
    </RequireAuth>
  );
}

function PurchaseOrderEditInner() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const emptyForm: UpdatePoForm = useMemo(
    () => ({
      supplierId: "",
      warehouseId: "",
      expectedDeliveryDate: "",
      notes: "",
      items: [],
    }),
    [],
  );

  const [form, setForm] = useState<UpdatePoForm>(emptyForm);

  useEffect(() => {
    if (!token || !id) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [po, sup, wh, inv] = await Promise.all([
          apiClient.get<any>(`/purchase-orders/${id}`, { token }),
          apiClient.get<Supplier[]>("/suppliers", { token }),
          apiClient.get<Warehouse[]>("/warehouses", { token }),
          apiClient
            .get<InventoryItem[]>("/inventory/items", { token })
            .catch(() => [] as InventoryItem[]),
        ]);

        setSuppliers(sup ?? []);
        setWarehouses(wh ?? []);
        setInventoryItems(inv ?? []);

        // Normalize PO response into form fields
        const expectedDeliveryDate = po?.expectedDeliveryDate
          ? new Date(po.expectedDeliveryDate).toISOString().slice(0, 10)
          : "";

        setForm({
          supplierId: po?.supplierId ?? "",
          warehouseId: po?.warehouseId ?? "",
          expectedDeliveryDate,
          notes: po?.notes ?? "",
          items:
            (po?.items ?? []).map((it: any) => ({
              id: it?.id,
              inventoryItemId: it?.inventoryItemId,
              quantity: it?.quantity,
              unitPrice: it?.unitPrice,
            })) ?? [],
        });
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load purchase order");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  function setItemAt(idx: number, patch: UpdatePoItem) {
    setForm((s) => {
      const items = [...s.items];
      items[idx] = { ...items[idx], ...patch };
      return { ...s, items };
    });
  }

  function addItem() {
    setForm((s) => ({
      ...s,
      items: [
        ...s.items,
        {
          inventoryItemId: "",
          quantity: 1,
          unitPrice: 0,
        },
      ],
    }));
  }

  function removeItem(idx: number) {
    setForm((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));
  }

  async function submit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);

    try {
      if (!form.supplierId) throw new Error("supplierId is required");

      const payload: any = {
        supplierId: form.supplierId,
        warehouseId: form.warehouseId || undefined,
        expectedDeliveryDate: form.expectedDeliveryDate || undefined,
        notes: form.notes || undefined,
      };

      // Only send items if at least one
      if (form.items.length > 0) {
        payload.items = form.items.map((it) => {
          const quantity = it.quantity;
          const unitPrice = it.unitPrice;
          return {
            id: it.id,
            inventoryItemId: it.inventoryItemId,
            quantity,
            unitPrice,
          };
        });
      }

      await apiClient.patch(`/purchase-orders/${id}`, payload, { token });
      // After save, go back to detail
      window.location.href = `/purchase-orders/${id}`;
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to update purchase order");
    } finally {
      setSubmitting(false);
    }
  }

  const canEdit = !loading;

  if (loading) return <div>Loading...</div>;
  if (error) return <ErrorAlert message={error} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Edit Purchase Order</h1>
        <Link href={`/purchase-orders/${id}`} style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      {error ? <ErrorAlert message={error} /> : null}

      <div
        style={{
          maxWidth: 760,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label
            style={{
              flex: "1 1 280px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            Supplier
            <select
              value={form.supplierId}
              onChange={(e) =>
                setForm((s) => ({ ...s, supplierId: e.target.value }))
              }
              style={{ padding: 10 }}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              flex: "1 1 220px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            Warehouse (optional)
            <select
              value={form.warehouseId}
              onChange={(e) =>
                setForm((s) => ({ ...s, warehouseId: e.target.value }))
              }
              style={{ padding: 10 }}
            >
              <option value="">None</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name ?? w.id}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{
              flex: "1 1 200px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            Expected delivery (optional)
            <input
              type="date"
              value={form.expectedDeliveryDate}
              onChange={(e) =>
                setForm((s) => ({ ...s, expectedDeliveryDate: e.target.value }))
              }
              style={{ padding: 10 }}
            />
          </label>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          Notes (optional)
          <textarea
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
            style={{ padding: 10, minHeight: 90 }}
          />
        </label>

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
                  Inventory Item
                  <select
                    value={it.inventoryItemId ?? ""}
                    onChange={(e) =>
                      setItemAt(idx, { inventoryItemId: e.target.value })
                    }
                    style={{ padding: 10 }}
                  >
                    <option value="">Select inventory item</option>
                    {inventoryItems.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name ?? inv.id}
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
                    value={it.quantity ?? 0}
                    onChange={(e) =>
                      setItemAt(idx, {
                        quantity: toNumberOrUndefined(e.target.value),
                      })
                    }
                    style={{ padding: 10 }}
                  />
                </label>

                <label
                  style={{
                    flex: "0 0 160px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  Unit price
                  <input
                    value={it.unitPrice ?? 0}
                    onChange={(e) =>
                      setItemAt(idx, {
                        unitPrice: toNumberOrUndefined(e.target.value),
                      })
                    }
                    style={{ padding: 10 }}
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
              disabled={!canEdit}
            >
              + Add item
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !canEdit}
          style={{
            width: "100%",
            padding: 12,
            background: submitting ? "#999" : "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: submitting || !canEdit ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
