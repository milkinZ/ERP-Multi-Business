"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";

const registerSchema = z.object({
  password: z
    .string()
    .min(12, "Use at least 12 characters")
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      "Password must be no more than 72 bytes",
    ),
});

type RegisterValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(values: RegisterValues) {
    setError(null);
    if (!token) {
      setError(
        "This invitation link is missing its setup token. Ask your administrator to send a new invitation.",
      );
      return;
    }

    try {
      await apiRequest("/auth/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token, password: values.password }),
      });
      setComplete(true);
      window.setTimeout(() => router.push("/login"), 1500);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to set up the account",
      );
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
      <div className="grid w-full overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.2),transparent_34%),linear-gradient(180deg,#0b3b78_0%,#10213e_100%)]         p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link
              href="/"
              className="text-[10px] font-bold uppercase tracking-[0.28em] text-white"
            >
              ERP Multi-Business
            </Link>
            <h1             className="mt-6 text-4xl font-semibold tracking-tight text-white">
              Set up access to your workspace.
            </h1>
          </div>
          <p className="text-sm leading-6 text-blue-100/80">
            Your administrator has assigned your tenant roles and outlet access.
            Set a password to activate the account.
          </p>
        </div>
        <div className="p-6 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-md">
            <Link
              href="/"
              className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary"
            >
              Back to overview
            </Link>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              Set up your account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Invitation links are single-use and expire after seven days.
            </p>
            {complete ? (
              <div
                role="status"
                className="mt-8 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-4 text-sm text-[var(--foreground)]"
              >
                Account activated. Taking you to sign in...
              </div>
            ) : token ? (
              <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5">
                <label className="block text-sm font-medium text-foreground">
                  Password
                  <input
                    {...register("password")}
                    type="password"
                    autoComplete="new-password"
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    At least 12 characters; maximum 72 bytes.
                  </span>
                  {errors.password ? (
                    <span className="mt-1 block text-xs text-destructive">
                      {errors.password.message}
                    </span>
                  ) : null}
                </label>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Activating account..." : "Set password"}
                </Button>
              </form>
            ) : (
              <div className="mt-8 space-y-4 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                <p className="font-medium text-foreground">
                  A valid invitation link is required.
                </p>
                <p className="text-muted-foreground">
                  Open the setup link from your invitation email. If it has
                  expired or was already used, ask your administrator to send a
                  new one.
                </p>
              </div>
            )}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already set up?{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
