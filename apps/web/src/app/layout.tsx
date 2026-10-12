import type { Metadata } from "next"
import React from "react"
import type { ReactNode } from "react"
import "./globals.css"
import { QueryProvider } from "@/providers/query-provider"
import { AuthProvider } from "@/components/auth/auth-provider"

export const metadata: Metadata = {
  title: "ERP Multi-Business",
  description: "Tenant operations and platform administration console",
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
