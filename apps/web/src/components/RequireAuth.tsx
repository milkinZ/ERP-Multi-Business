"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, loading } = useAuth();

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/");
    }
  }, [loading, token, router]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (!token) {
    return null;
  }

  return <>{children}</>;
}
