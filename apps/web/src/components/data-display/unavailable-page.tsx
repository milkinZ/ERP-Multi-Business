import React from "react"
import { PageHeader, UnavailableState } from "@/components/data-display/states"

export function UnavailablePage({ title, area }: { title: string; area: "platform" | "tenant" }) {
  return (
    <>
      <PageHeader
        eyebrow={area === "platform" ? "Platform console" : "Tenant application"}
        title={title}
        description="This route is reserved in the frontend architecture and awaits a confirmed backend contract."
      />
      <UnavailableState
        title="Integration pending"
        description="No backend endpoint is currently connected here, so this area intentionally stays honest and does not display fabricated records or fake metrics."
      />
    </>
  )
}
