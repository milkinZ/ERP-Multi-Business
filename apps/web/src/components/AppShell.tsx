"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

const nav = [
  { href: "/products", label: "Products" },
  { href: "/sales-orders", label: "Sales Orders" },
  { href: "/purchase-orders", label: "Purchase Orders" },
  { href: "/inventory", label: "Inventory" },
  { href: "/payments", label: "Payments" },
  { href: "/kitchen", label: "Kitchen" },
  { href: "/recipes/new", label: "Recipes" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/warehouses", label: "Warehouses" },
  { href: "/analytics", label: "Analytics" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, loading } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 240,
          borderRight: "1px solid #e5e5e5",
          padding: 16,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 16 }}>ERP</div>

        {loading ? (
          <div style={{ fontSize: 12, color: "#666" }}>Loading...</div>
        ) : user ? (
          <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
            {user.tenantId}
            <div style={{ marginTop: 4, fontSize: 11 }}>{user.sub}</div>
          </div>
        ) : null}

        <nav style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: active ? "#111" : "transparent",
                  color: active ? "#fff" : "#111",
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {user ? (
          <button
            onClick={logout}
            style={{
              marginTop: 18,
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        ) : null}
      </aside>

      <main style={{ flex: 1, padding: 24 }}>{children}</main>
    </div>
  );
}
