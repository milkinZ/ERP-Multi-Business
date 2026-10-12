"use client"
import React from "react"
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div role="alert" className="border border-[var(--danger)] bg-[var(--panel)] p-6"><h2 className="font-bold">Tenant workspace unavailable</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">The page failed without exposing server details.</p><button className="mt-4 underline" onClick={reset}>Try again</button></div> }
