"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { apiClient } from "../../../../src/lib/apiClient";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { RequireAuth } from "../../../../src/components/RequireAuth";
import { ErrorAlert } from "../../../../src/components/ErrorAlert";

type RecipeIngredient = {
  ingredient?: { id: string; name?: string } | null;
  quantity?: number;
};

type Recipe = {
  id: string;
  product?: { id: string; name?: string } | null;
  items?: RecipeIngredient[];
};

export default function RecipeByProductPage() {
  return (
    <RequireAuth>
      <RecipeByProductInner />
    </RequireAuth>
  );
}

function RecipeByProductInner() {
  const params = useParams();
  const productId = String(params.productId ?? "");
  const { token } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token || !productId) return;
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.get<Recipe>(`/recipes/${productId}`, {
          token,
        });
        setRecipe(data ?? null);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message ?? "Failed to load recipe");
        setRecipe(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, productId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <ErrorAlert message={error} />;
  if (!recipe) return <div>Not found</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Recipe</h1>
        <Link href="/recipes/new" style={{ fontSize: 13 }}>
          ← Back to create
        </Link>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#666" }}>Product</div>
        <div>{recipe.product?.name ?? recipe.product?.id ?? "-"}</div>
      </div>

      <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
        Ingredients
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Ingredient
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px solid #ddd",
                padding: 8,
              }}
            >
              Qty
            </th>
          </tr>
        </thead>
        <tbody>
          {(recipe.items ?? []).map((it, idx) => (
            <tr key={(it.ingredient?.id ?? "x") + "-" + idx}>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {it.ingredient?.name ?? it.ingredient?.id ?? "-"}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #f0f0f0" }}>
                {it.quantity ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
