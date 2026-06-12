"use client";

import React from "react";
import Link from "next/link";

import { RequireAuth } from "../../../src/components/RequireAuth";

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "12px 14px",
        border: "1px solid #e5e5e5",
        borderRadius: 10,
        background: "#fff",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {label}
    </Link>
  );
}

export default function AppRootHome() {
  return (
    <RequireAuth>
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>ERP Home</h1>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 18 }}>
          Pilih modul untuk mulai bekerja.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <QuickLink href="/products" label="Products" />
          <QuickLink href="/sales-orders" label="Sales Orders" />
          <QuickLink href="/purchase-orders" label="Purchase Orders" />
          <QuickLink href="/inventory/stock-in" label="Inventory" />
          <QuickLink href="/payments" label="Payments" />
          <QuickLink href="/kitchen" label="Kitchen" />
          <QuickLink href="/recipes/new" label="Recipes" />
          <QuickLink href="/ingredients" label="Ingredients" />
          <QuickLink href="/suppliers" label="Suppliers" />
          <QuickLink href="/warehouses" label="Warehouses" />
          <QuickLink href="/analytics" label="Analytics" />
        </div>

        <div style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
          Catatan: beberapa fitur ter-gated oleh permission.
        </div>
      </div>
    </RequireAuth>
  );
}
