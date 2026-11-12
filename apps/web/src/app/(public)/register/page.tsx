"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api/client";

const businessTypes = [
  "CAFE",
  "RETAIL",
  "LAUNDRY",
  "GYM",
  "HOTEL",
  "MANUFACTURING",
] as const;
const currencies = ["IDR", "USD", "SGD", "MYR", "PHP"] as const;

const registrationSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(254),
  planId: z.string().min(1, "Choose a plan"),
  businessType: z.enum(businessTypes),
  currencyCode: z.enum(currencies),
});

const passwordSchema = z.object({
  password: z
    .string()
    .min(12, "Use at least 12 characters")
    .refine(
      (value) => new TextEncoder().encode(value).length <= 72,
      "Password must be no more than 72 bytes",
    ),
});

type RegistrationValues = z.infer<typeof registrationSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

type RegistrationPlan = {
  id: string;
  type: string;
  name: string;
  priceCents: number;
  maxOutlets: number | null;
  maxUsers: number | null;
  maxMonthlyOrders: number | null;
  modules: Array<{ key: string; name: string; description: string | null }>;
};

const money = (amount: number) =>
  amount === 0 ? "Free" : `IDR ${amount.toLocaleString("id-ID")} / month`;

export default function RegisterPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [plans, setPlans] = useState<RegistrationPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [registrationSent, setRegistrationSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const registrationForm = useForm<RegistrationValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      businessType: "CAFE",
      currencyCode: "IDR",
    },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  });
  const selectedPlan = plans.find(
    (plan) => plan.id === registrationForm.watch("planId"),
  );

  useEffect(() => {
    let active = true;
    const invitationToken =
      new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(invitationToken);
    if (!invitationToken) {
      apiRequest<RegistrationPlan[]>("/auth/tenant-registration/plans")
        .then((availablePlans) => {
          if (active) setPlans(availablePlans);
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Unable to load registration plans",
            );
          }
        })
        .finally(() => {
          if (active) setPlansLoading(false);
        });
    } else {
      setPlansLoading(false);
    }

    return () => {
      active = false;
    };
  }, []);

  async function submitRegistration(values: RegistrationValues) {
    setError(null);
    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setRegistrationSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to start registration",
      );
    }
  }

  async function submitPassword(values: PasswordValues) {
    setError(null);
    if (!token) {
      setError(
        "This verification link is missing its setup token. Ask your administrator to send a new invitation.",
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
        <div className="hidden bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.2),transparent_34%),linear-gradient(180deg,#0b3b78_0%,#10213e_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Link
              href="/"
              className="text-[10px] font-bold uppercase tracking-[0.28em] text-white"
            >
              ERP Multi-Business
            </Link>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white">
              {token
                ? "Verify your email and set up your workspace."
                : "Create your business workspace."}
            </h1>
          </div>
          <p className="text-sm leading-6 text-blue-100/80">
            {token
              ? "This one-time link verifies your email address and lets you create the Owner password."
              : "Choose a plan and tell us about your business. We will email you a one-time link to verify your address and create your Owner password."}
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
            {token ? (
              <>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Set up your Owner account
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Verify this email by setting a password. Invitation links are
                  single-use and expire after seven days.
                </p>
                {complete ? (
                  <div
                    role="status"
                    className="mt-8 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-4 text-sm text-[var(--foreground)]"
                  >
                    Account activated. Taking you to sign in...
                  </div>
                ) : (
                  <form
                    onSubmit={passwordForm.handleSubmit(submitPassword)}
                    className="mt-8 space-y-5"
                  >
                    <label className="block text-sm font-medium text-foreground">
                      Owner password
                      <input
                        {...passwordForm.register("password")}
                        type="password"
                        autoComplete="new-password"
                        className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                      />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        At least 12 characters; maximum 72 bytes.
                      </span>
                      {passwordForm.formState.errors.password ? (
                        <span className="mt-1 block text-xs text-destructive">
                          {passwordForm.formState.errors.password.message}
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
                      disabled={passwordForm.formState.isSubmitting}
                    >
                      {passwordForm.formState.isSubmitting
                        ? "Activating account..."
                        : "Verify email and set password"}
                    </Button>
                  </form>
                )}
              </>
            ) : (
              <>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Register your business
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We will email a verification link before activating your Owner
                  account.
                </p>
                {registrationSent ? (
                  <div
                    role="status"
                    className="mt-8 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-4 text-sm text-[var(--foreground)]"
                  >
                    If registration can proceed, a verification link will be
                    sent to that email address. Check your inbox and spam
                    folder.
                  </div>
                ) : plansLoading ? (
                  <p className="mt-8 text-sm text-muted-foreground">
                    Loading available plans...
                  </p>
                ) : (
                  <form
                    onSubmit={registrationForm.handleSubmit(submitRegistration)}
                    className="mt-8 space-y-4"
                  >
                    <label className="block text-sm font-medium text-foreground">
                      Business name
                      <input
                        {...registrationForm.register("name")}
                        autoComplete="organization"
                        className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                      />
                      {registrationForm.formState.errors.name ? (
                        <span className="mt-1 block text-xs text-destructive">
                          {registrationForm.formState.errors.name.message}
                        </span>
                      ) : null}
                    </label>
                    <label className="block text-sm font-medium text-foreground">
                      Owner email
                      <input
                        {...registrationForm.register("email")}
                        type="email"
                        autoComplete="email"
                        className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                      />
                      {registrationForm.formState.errors.email ? (
                        <span className="mt-1 block text-xs text-destructive">
                          {registrationForm.formState.errors.email.message}
                        </span>
                      ) : null}
                    </label>
                    <label className="block text-sm font-medium text-foreground">
                      Plan
                      <select
                        {...registrationForm.register("planId")}
                        className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Choose a plan</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} — {money(plan.priceCents)}
                          </option>
                        ))}
                      </select>
                      {registrationForm.formState.errors.planId ? (
                        <span className="mt-1 block text-xs text-destructive">
                          {registrationForm.formState.errors.planId.message}
                        </span>
                      ) : null}
                      {selectedPlan ? (
                        <span className="mt-2 block rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                          {selectedPlan.maxOutlets === null
                            ? "Unlimited"
                            : selectedPlan.maxOutlets}{" "}
                          outlets ·{" "}
                          {selectedPlan.maxUsers === null
                            ? "Unlimited"
                            : selectedPlan.maxUsers}{" "}
                          users ·{" "}
                          {selectedPlan.maxMonthlyOrders === null
                            ? "Unlimited"
                            : selectedPlan.maxMonthlyOrders}{" "}
                          monthly orders
                          {selectedPlan.modules.length ? (
                            <span className="mt-2 block text-foreground">
                              Includes:{" "}
                              {selectedPlan.modules
                                .map((module) => module.name)
                                .join(", ")}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium text-foreground">
                        Business type
                        <select
                          {...registrationForm.register("businessType")}
                          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                        >
                          {businessTypes.map((type) => (
                            <option key={type} value={type}>
                              {type.charAt(0) + type.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-foreground">
                        Business currency
                        <select
                          {...registrationForm.register("currencyCode")}
                          className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                        >
                          {currencies.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    ) : null}
                    {plans.length === 0 ? (
                      <p role="alert" className="text-sm text-destructive">
                        Tenant registration is temporarily unavailable because
                        no plans are configured.
                      </p>
                    ) : (
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={registrationForm.formState.isSubmitting}
                      >
                        {registrationForm.formState.isSubmitting
                          ? "Starting registration..."
                          : "Continue with email verification"}
                      </Button>
                    )}
                  </form>
                )}
              </>
            )}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
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
