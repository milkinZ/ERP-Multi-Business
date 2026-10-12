"use client"

import React from "react"

import { PageHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

export default function PlatformSettingsPage() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const canRead = hasPermission(session, "super-admin.read")

  if (!canRead) return <UnavailableState title="Settings access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view platform settings." />

  return (
    <>
      <PageHeader eyebrow="Platform console / configuration" title="Platform settings" description="Deployment configuration and runtime environment values remain backend-owned. No database-backed editable platform settings contract is currently available." actions={<StatusBadge tone="warning">Unavailable</StatusBadge>} />
      <UnavailableState title="No supported platform settings" description="The current backend exposes configuration through deployment environment and tenant-scoped feature flags, but does not expose safe platform-global settings for this UI. No fabricated controls are shown." />
    </>
  )
}