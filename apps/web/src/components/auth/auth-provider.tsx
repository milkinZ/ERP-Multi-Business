"use client";

import React from "react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useAuthStore } from "@/stores/auth.store";

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate);
  const pathname = usePathname();
  const scope = pathname.startsWith("/platform") ? "platform" : "tenant";

  useEffect(() => {
    void hydrate(scope);
  }, [hydrate, scope]);

  return <>{children}</>;
}
