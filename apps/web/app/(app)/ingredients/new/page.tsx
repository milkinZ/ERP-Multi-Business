"use client";

import React, { useState } from "react";
import Link from "next/link";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { ErrorAlert } from "../../../../src/components/ErrorAlert";

type IngredientForm = {
  name: string;
  unit: string;
};

export default function NewIngredientPage() {
  return (
    <RequireAuth>
      <NewIngredientInner />
    </RequireAuth>
  );
}

function NewIngredientInner() {
  const { token } = useAuth();

  const [form, setForm] = useState<IngredientForm>({ name: "", unit: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit() {
    if (!token) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await apiClient.post(
        "/ingredients",
        {
          name: form.name,
          unit: form.unit,
        },
        { token },
      );

      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/ingredients";
      }, 500);
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to create ingredient");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>New Ingredient</h1>
        <Link href="/ingredients" style={{ fontSize: 13 }}>
          ← Back
        </Link>
      </div>

      {error ? <ErrorAlert message={error} /> : null}
      {success ? (
        <div
          style={{
            background: "#e9ffe9",
            border: "1px solid #8fda8f",
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          Created. Redirecting...
        </div>
      ) : null}

      <div
        style={{
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          Unit
          <input
            value={form.unit}
            onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
            style={{ padding: 10 }}
            placeholder="kg, pcs, ml"
          />
        </label>

        <button
          onClick={() => void onSubmit()}
          disabled={loading}
          style={{
            padding: 12,
            background: loading ? "#999" : "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}
