"use client"

import React, { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import { EmptyState, PageHeader, SectionHeader, StatusBadge, UnavailableState } from "@/components/data-display/states"
import { getPlatformSettings, PlatformSetting, updatePlatformSetting } from "@/features/platform/api/queries"
import { hasPermission } from "@/lib/permissions"
import { useAuthStore } from "@/stores/auth.store"

const CURRENCY_OPTIONS = ["IDR", "USD", "SGD", "MYR", "PHP", "THB", "VND"]

export default function PlatformSettingsPage() {
  const token = useAuthStore((state) => state.accessToken)
  const session = useAuthStore((state) => state.session)
  const queryClient = useQueryClient()
  const canRead = hasPermission(session, "super-admin.read")
  const canManage = hasPermission(session, "super-admin.manage.system")
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => getPlatformSettings(token as string),
    enabled: Boolean(token && canRead),
  })

  useEffect(() => {
    if (query.data && Object.keys(values).length === 0) {
      setValues(Object.fromEntries(query.data.map((setting) => [setting.key, setting.value])))
    }
  }, [query.data, values])

  const mutation = useMutation({
    mutationFn: (setting: PlatformSetting) => {
      if (!token) throw new Error("Authentication required")
      return updatePlatformSetting(token, { ...setting, value: values[setting.key] ?? setting.value })
    },
    retry: 0,
    onSuccess: (updated) => {
      setValues((current) => ({ ...current, [updated.key]: updated.value }))
      queryClient.setQueryData<PlatformSetting[]>(["platform-settings"], (current) =>
        current?.map((setting) => setting.key === updated.key ? { ...setting, ...updated } : setting),
      )
      setMessage(`${updated.label} saved.`)
    },
    onError: (cause) => {
      setMessage(cause instanceof ApiError ? cause.message : "The setting could not be saved.")
    },
  })

  if (!canRead) return <UnavailableState title="Settings access is restricted" description="Your platform session does not include the super-admin read permission." />
  if (!token) return <UnavailableState title="Platform authentication is required" description="Sign in with an authorized platform operator session to view platform settings." />

  return (
    <>
      <PageHeader eyebrow="Platform console / configuration" title="Platform settings" description="Manage the audited allowlist of non-secret platform defaults. These display and support settings do not change existing invoices or payment currency." actions={<StatusBadge tone={canManage ? "success" : "info"}>{canManage ? "Manage access" : "Read only"}</StatusBadge>} />
      {message ? <p role="status" className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--foreground)]">{message}</p> : null}
      {query.isPending ? <div className="h-56 animate-pulse rounded-3xl bg-[var(--muted)]" /> : query.isError ? <UnavailableState title="Platform settings unavailable" description={query.error instanceof ApiError && query.error.status === 403 ? "This platform session is not authorized to read settings." : "The platform settings API could not be reached."} /> : !query.data?.length ? <EmptyState title="No platform settings" description="The platform settings API returned no allowlisted settings." /> : (
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-5">
          <SectionHeader eyebrow="Allowlisted configuration" title="Platform defaults" />
          <div className="mt-5 divide-y divide-[var(--border)]">
            {query.data.map((setting) => {
              const value = values[setting.key] ?? setting.value
              const changed = value !== setting.value
              return (
                <div key={setting.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm font-medium text-[var(--foreground)]">
                    {setting.label}
                    {setting.key === "defaultCurrency" ? (
                      <select value={value} onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))} disabled={!canManage || mutation.isPending} className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm">
                        {CURRENCY_OPTIONS.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                      </select>
                    ) : (
                      <input value={value} onChange={(event) => setValues((current) => ({ ...current, [setting.key]: event.target.value }))} readOnly={!canManage} maxLength={500} type={setting.key === "supportEmail" ? "email" : setting.key === "supportUrl" ? "url" : "text"} className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2 text-sm text-[var(--foreground)] read-only:opacity-75" />
                    )}
                  </label>
                  {canManage ? <button type="button" disabled={!changed || mutation.isPending} onClick={() => mutation.mutate(setting)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--panel-alt)] disabled:opacity-50">{mutation.isPending && mutation.variables?.key === setting.key ? "Saving..." : "Save"}</button> : <span className="pb-2 text-xs text-[var(--muted-foreground)]">Version {setting.version}</span>}
                </div>
              )
            })}
          </div>
          <p className="mt-5 text-xs text-[var(--muted-foreground)]">Currency is for display formatting only. Billing remains in IDR. Every change is validated, version-checked, and recorded in the platform audit log.</p>
        </section>
      )}
    </>
  )
}
