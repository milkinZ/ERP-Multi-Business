'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { apiClient } from '../../../../src/lib/apiClient';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { RequireAuth } from '../../../../src/components/RequireAuth';
import { ErrorAlert } from '../../../../src/components/ErrorAlert';

type Supplier = { id: string; name?: string };

type Warehouse = { id: string; name?: string };

type InventoryItem = {
  id: string;
  name?: string;
  unit?: string;
};

type ItemForm = {
  inventoryItemId: string;
  quantity: string;
  unitPrice: string;
};

type CreatePoForm = {
  supplierId: string;
  warehouseId: string;
  expectedDeliveryDate: string; // yyyy-mm-dd
  notes: string;
  items: ItemForm[];
};

function toNumberOrUndefined(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function PurchaseOrderCreatePage() {
  return (
    <RequireAuth>
      <PurchaseOrderCreateInner />
    </RequireAuth>
  );
}

function PurchaseOrderCreateInner() {
  const { token } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const formDefault: CreatePoForm = useMemo(
    () => ({
      supplierId: '',
      warehouseId: '',
      expectedDeliveryDate: '',
      notes: '',
      items: [
        {
          inventoryItemId: '',
          quantity: '1',
          unitPrice: '0',
        },
      ],
    }),
    [],
  );

  const [form, setForm] = useState<CreatePoForm>(formDefault);

  useEffect(() => {
    (async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [sup, wh, inv] = await Promise.all([
          apiClient.get<Supplier[]>('/suppliers', { token }),
          apiClient.get<Warehouse[]>('/warehouses', { token }),
          // No dedicated endpoint for inventory items exposed in current frontend,
          // but backend inventory items exist. We'll call inventory/stock-in history style is not correct.
          // Use best-effort: inventory history returns movements; not suitable.
          // So we keep inventoryItems empty unless you add an endpoint.
          apiClient.get<InventoryItem[]>('/inventory/items', { token }).catch(() => []),
        ]);

        setSuppliers(sup ?? []);
        setWarehouses(wh ?? []);
        setInventoryItems(inv ?? []);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load prerequisites');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

function setItemAt(idx: number, patch: Partial<ItemForm>) {
    setForm((s) => {
      const items = [...s.items];
      items[idx] = { ...items[idx], ...(patch as ItemForm) };
      return { ...s, items };
    });
  }

  function addItem() {
    setForm((s) => ({
      ...s,
      items: [
        ...s.items,
        { inventoryItemId: '', quantity: '1', unitPrice: '0' },
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
      if (!form.supplierId) throw new Error('supplierId is required');
      if (form.items.length === 0) throw new Error('At least one item is required');

      const itemsPayload = form.items
        .filter((it) => it.inventoryItemId)
        .map((it) => {
          const quantity = toNumberOrUndefined(it.quantity);
          const unitPrice = toNumberOrUndefined(it.unitPrice);
          if (!quantity || quantity <= 0) throw new Error('quantity must be > 0');
          if (!unitPrice || unitPrice < 0) throw new Error('unitPrice must be >= 0');
          return {
            inventoryItemId: it.inventoryItemId,
            quantity,
            unitPrice,
          };
        });

      if (itemsPayload.length === 0) throw new Error('At least one valid item is required');

      await apiClient.post(
        '/purchase-orders',
        {
          supplierId: form.supplierId,
          warehouseId: form.warehouseId || undefined,
          expectedDeliveryDate: form.expectedDeliveryDate || undefined,
          notes: form.notes || undefined,
          items: itemsPayload,
        },
        { token },
      );

      window.location.href = '/purchase-orders';
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>New Purchase Order</h1>
        <Link href="/purchase-orders" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      {error ? <ErrorAlert message={error} /> : null}

      {loading ? <div>Loading...</div> : null}

      {!loading ? (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Supplier
              <select
                value={form.supplierId}
                onChange={(e) => setForm((s) => ({ ...s, supplierId: e.target.value }))}
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

            <label style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Warehouse (optional)
              <select
                value={form.warehouseId}
                onChange={(e) => setForm((s) => ({ ...s, warehouseId: e.target.value }))}
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

            <label style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Expected delivery (optional)
              <input
                type="date"
                value={form.expectedDeliveryDate}
                onChange={(e) => setForm((s) => ({ ...s, expectedDeliveryDate: e.target.value }))}
                style={{ padding: 10 }}
              />
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            Notes (optional)
            <textarea
              value={form.notes}
              onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              style={{ padding: 10, minHeight: 90 }}
            />
          </label>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 700 }}>Items</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {form.items.map((it, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 12,
                    border: '1px solid #e5e5e5',
                    borderRadius: 8,
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                    alignItems: 'flex-end',
                  }}
                >
                  <label style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Inventory Item
                    <select
                      value={it.inventoryItemId}
                      onChange={(e) => setItemAt(idx, { inventoryItemId: e.target.value })}
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

                  <label style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Quantity
                    <input
                      value={it.quantity}
                      onChange={(e) => setItemAt(idx, { quantity: e.target.value })}
                      style={{ padding: 10 }}
                    />
                  </label>

                  <label style={{ flex: '0 0 160px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    Unit price
                    <input
                      value={it.unitPrice}
                      onChange={(e) => setItemAt(idx, { unitPrice: e.target.value })}
                      style={{ padding: 10 }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #b00020',
                      background: '#fff',
                      color: '#b00020',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    disabled={form.items.length <= 1}
                    title={form.items.length <= 1 ? 'At least one item required' : 'Remove'}
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
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                + Add item
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
              * Catatan: jika endpoint daftar inventory item belum tersedia di frontend,
              daftar item akan kosong. Anda bisa pilih manual dengan menambahkan endpoint.
            </div>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            style={{
              width: '100%',
              padding: 12,
              background: submitting ? '#999' : '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : 'Create PO'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

