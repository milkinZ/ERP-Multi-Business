"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "../src/providers/AuthProvider";

function PlanCard({
  title,
  subtitle,
  price,
  features,
  cta,
  onClick,
}: {
  title: string;
  subtitle: string;
  price: string;
  features: string[];
  cta: string;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid #eaeaea",
        borderRadius: 16,
        padding: 16,
        background: "#fff",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
        {subtitle}
      </div>

      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 12 }}>
        {price}
      </div>

      <ul style={{ marginTop: 12, paddingLeft: 18, fontSize: 13 }}>
        {features.map((f) => (
          <li key={f} style={{ marginBottom: 6 }}>
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "12px 14px",
          border: "none",
          borderRadius: 12,
          background: "#111",
          color: "#fff",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {cta}
      </button>
    </div>
  );
}

export default function ERPPlansHomePage() {
  const router = useRouter();
  const { token } = useAuth();

  // Placeholder: belum ada API checkout/subscription di task ini.
  // Jadi klik CTA akan mengarahkan ke halaman login jika belum auth,
  // atau ke dashboard ERP (route ERP Home) jika sudah login.
  function handleSelectPlan(planId: string) {
    // planId disimpan sementara untuk nanti dipakai saat backend subscription siap.
    // Saat ini cukup redirect.
    try {
      window.sessionStorage.setItem("selectedPlanId", planId);
    } catch {
      // ignore
    }

    if (!token) {
      router.push("/login");
      return;
    }

    // After login, user should land on ERP home.
    router.push("/plans");
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "#666" }}>ERP Multi Business</div>
        <h1 style={{ fontSize: 30, marginTop: 6 }}>Paket ERP Anda</h1>
        <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
          Pilih paket untuk mulai mengelola produk, inventory, purchase,
          pembayaran, dan modul cafe/kitchen.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        <PlanCard
          title="Basic"
          subtitle="Untuk bisnis kecil"
          price="Rp 299k / bulan"
          cta="Pilih Basic"
          onClick={() => handleSelectPlan("basic")}
          features={[
            "Products",
            "Inventory (stock in/adjust/waste)",
            "Purchase Orders",
            "Payments",
            "Analytics (basic)",
          ]}
        />
        <PlanCard
          title="Pro"
          subtitle="Untuk multi outlet"
          price="Rp 699k / bulan"
          cta="Pilih Pro"
          onClick={() => handleSelectPlan("pro")}
          features={[
            "Sales Orders",
            "Kitchen Queue",
            "Recipes + Ingredients",
            "Suppliers + Warehouses",
            "Analytics (top products)",
          ]}
        />
        <PlanCard
          title="Enterprise"
          subtitle="Untuk kebutuhan custom"
          price="Hubungi kami"
          cta="Diskusikan"
          onClick={() => handleSelectPlan("enterprise")}
          features={[
            "Semua fitur Pro",
            "Custom reporting & permission",
            "Priority support",
            "Integrasi tambahan (roadmap)",
          ]}
        />
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "#666" }}>
        Catatan: halaman ini masih placeholder karena endpoint
        subscription/checkout belum ada di backend pada task ini.
      </div>
    </div>
  );
}
