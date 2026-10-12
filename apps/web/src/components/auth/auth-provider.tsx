"use client"

import React from "react"
import { useEffect } from "react"
import type { ReactNode } from "react"

import { useAuthStore } from "@/stores/auth.store"

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return <>{children}</>
}