"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { apiClient } from "../../../../src/lib/apiClient";
import Can from "../../../../src/components/Can";
import { PERMISSIONS } from "../../../../src/lib/permissions";

export default function RecipeCreatePage() {
  return (
    <RequireAuth>
      <RecipeCreateInner />
    </RequireAuth>
  );
}

type ProductOption = { id: string; name?: string };

type CreatedRecipe = { id?: string; productId?: string };

function RecipeCreateInner() {
  const { token } = useAuth();

  const [productId, setProductId] = useState("");
  const [ingredientsJson, setIngredientsJson] = useState("");

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      setLoadingProducts(true);
      setError(null);
      try {
        // Best-effort: API for products exists
        const data = await apiClient.get<ProductOption[]>("/products", {
          token,
        });
        setProducts((data ?? []).map((p) => ({ id: p.id, name: p.name })));
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load products");
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, [token]);

  async function submit() {
    if (!token) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!productId) throw new Error("productId is required");
      if (!ingredientsJson) throw new Error("ingredients is required");

      const ingredients = JSON.parse(ingredientsJson) as unknown;

      await apiClient.post<CreatedRecipe>(
        "/recipes",
        {
          productId,
          items: ingredients,
        },
        { token },
      );

      setSuccess("Recipe created");
      setIngredientsJson("");
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? "Failed to create recipe");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>New Recipe</h1>

      <Can
        permission={PERMISSIONS.RECIPE_CREATE}
        fallback={<div>Forbidden</div>}
      >
        <div style={{ maxWidth: 560 }}>
          <label style={{ display: "block", marginBottom: 10 }}>
            Product
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              disabled={loadingProducts}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "block", marginBottom: 10 }}>
            Ingredients (JSON)
            <textarea
              value={ingredientsJson}
              onChange={(e) => setIngredientsJson(e.target.value)}
              style={{
                width: "100%",
                padding: 10,
                marginTop: 6,
                minHeight: 120,
              }}
              placeholder='[{ "ingredientId": "...", "quantity": 1 }]'
            />
          </label>

          {error ? (
            <div style={{ color: "red", marginBottom: 10 }}>{error}</div>
          ) : null}
          {success ? (
            <div style={{ color: "green", marginBottom: 10 }}>{success}</div>
          ) : null}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
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
            {submitting ? "Submitting..." : "Create"}
          </button>
        </div>
      </Can>
    </div>
  );
}
