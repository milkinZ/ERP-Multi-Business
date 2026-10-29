"use client";

import React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { canAccessPlatform } from "@/lib/permissions";
import { useAuthStore } from "@/stores/auth.store";

type GuardScope = "erp" | "platform";

export function AuthGuard({
  children,
  scope,
}: {
  children: ReactNode;
  scope: GuardScope;
}) {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const session = useAuthStore((state) => state.session);
  const status = useAuthStore((state) => state.status);

  useEffect(() => {
    if (status === "hydrating") {
      return;
    }

    if (!accessToken) {
      router.replace(scope === "platform" ? "/platform/login" : "/login");
      return;
    }

    const scopeMatches =
      scope === "platform"
        ? session?.scope === "platform"
        : session?.scope === "tenant";
    if (!scopeMatches) {
      router.replace(scope === "platform" ? "/platform/login" : "/login");
      return;
    }

    if (scope === "platform" && !canAccessPlatform(session)) {
      router.replace("/platform/login");
    }
  }, [accessToken, router, scope, session, status]);

  if (status === "hydrating") {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Restoring your session...
      </div>
    );
  }

  const scopeMatches =
    scope === "platform"
      ? session?.scope === "platform"
      : session?.scope === "tenant";
  if (!accessToken || !scopeMatches) {
    return null;
  }

  if (scope === "platform" && !canAccessPlatform(session)) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Platform access requires a platform-scoped session.
      </div>
    );
  }

  return <>{children}</>;
}
