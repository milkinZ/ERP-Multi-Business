import type { ReactNode } from "react"
import React from "react"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.22),transparent_26%),linear-gradient(180deg,#edf5ff_0%,#f7faff_100%)]">
      {children}
    </main>
  )
}
