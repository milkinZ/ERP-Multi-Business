"use client";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { FormButton } from "../../src/components/FormButton";
import { useAuth } from "../../src/providers/AuthProvider";
import { register as registerApi } from "../../src/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [outletId, setOutletId] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Register</h1>

      {[
        {
          label: "Email",
          value: email,
          onChange: (v: string) => setEmail(v),
        },
        {
          label: "Password",
          value: password,
          type: "password",
          onChange: (v: string) => setPassword(v),
        },
        {
          label: "Tenant ID",
          value: tenantId,
          onChange: (v: string) => setTenantId(v),
        },
        {
          label: "Role ID",
          value: roleId,
          onChange: (v: string) => setRoleId(v),
        },
        {
          label: "Outlet ID (optional)",
          value: outletId,
          onChange: (v: string) => setOutletId(v),
        },
      ].map((f) => (
        <label key={f.label} style={{ display: "block", marginBottom: 8 }}>
          {f.label}
          <input
            type={((f as { type?: string }).type ?? "text") as string}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </label>
      ))}

      {error ? (
        <div style={{ color: "red", marginBottom: 12 }}>{error}</div>
      ) : null}

      <FormButton
        disabled={loading}
        onClick={async () => {
          try {
            setLoading(true);
            setError(null);

            await registerApi({
              email,
              password,
              tenantId,
              roleId,
              outletId: outletId ? outletId : null,
            });

            // auto-login after register
            await login({ email, password });
            router.push("/home");
          } catch (e) {
            const err = e as { message?: string };
            setError(err?.message ?? "Register failed");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Registering..." : "Register"}
      </FormButton>

      <div style={{ marginTop: 16 }}>
        <a href="/login">Sudah punya akun? Login</a>
      </div>
    </div>
  );
}
