"use client"

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"
import type { ReactNode } from "react"
import { useState } from "react"

import { ApiError } from "@/lib/api/client"

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache(),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false
              return failureCount < 2
            },
            refetchOnWindowFocus: false,
          },
          mutations: { retry: 0 },
        },
      }),
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
