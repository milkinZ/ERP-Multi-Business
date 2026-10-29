"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth.store";

export default function PlatformAuthCallbackPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const session = useAuthStore((state) => state.session);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      setError(true);
      return;
    }
    if (status === "authenticated" && session?.scope === "platform") {
      router.replace("/platform/dashboard");
    } else if (status === "unauthenticated") {
      setError(true);
    }
  }, [router, session?.scope, status]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-12">
        <section className="w-full max-w-xl rounded-[28px] border border-border bg-card p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-12">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Platform sign in was not completed
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Confirm your organization identity is provisioned and that MFA
            satisfied the platform sign-in policy.
          </p>
          <Link
            href="/platform/login"
            className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-sm text-muted-foreground">
      Restoring your platform session...
    </div>
  );
}
