"use client"

import React, { useEffect, useState } from "react"

export type KitchenTimerState =
  | { kind: "unconfigured"; label: string }
  | { kind: "waiting"; label: string }
  | { kind: "running"; label: string }
  | { kind: "overdue"; label: string }
  | { kind: "completed"; label: string }
  | { kind: "completed-late"; label: string }

function formatDuration(seconds: number) {
  const duration = Math.max(0, Math.floor(Math.abs(seconds)))
  const hours = Math.floor(duration / 3600)
  const minutes = Math.floor((duration % 3600) / 60)
  const remainder = duration % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

export function getKitchenTimerState(
  prepTimeMinutes: number | null,
  startedAt: string | null,
  completedAt: string | null,
  now = Date.now(),
): KitchenTimerState {
  if (!prepTimeMinutes || prepTimeMinutes < 1) {
    return { kind: "unconfigured", label: "No prep target configured" }
  }
  if (!startedAt) {
    return {
      kind: "waiting",
      label: `Target ${prepTimeMinutes} min · starts with cooking`,
    }
  }

  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) {
    return { kind: "waiting", label: "Timer unavailable" }
  }
  const completed = completedAt ? Date.parse(completedAt) : Number.NaN
  const elapsedSeconds = Math.max(
    0,
    Math.floor(((Number.isFinite(completed) ? completed : now) - started) / 1000),
  )
  const targetSeconds = prepTimeMinutes * 60
  if (Number.isFinite(completed)) {
    const lateBy = elapsedSeconds - targetSeconds
    return lateBy > 0
      ? {
          kind: "completed-late",
          label: `Finished ${formatDuration(lateBy)} over target`,
        }
      : {
          kind: "completed",
          label: `Finished in ${formatDuration(elapsedSeconds)}`,
        }
  }

  const remaining = targetSeconds - elapsedSeconds
  return remaining >= 0
    ? { kind: "running", label: `${formatDuration(remaining)} remaining` }
    : { kind: "overdue", label: `${formatDuration(remaining)} overdue` }
}

export function KitchenItemTimer({
  prepTimeMinutes,
  startedAt,
  completedAt,
}: {
  prepTimeMinutes: number | null
  startedAt: string | null
  completedAt: string | null
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || completedAt || !prepTimeMinutes) return
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [completedAt, prepTimeMinutes, startedAt])

  const timer = getKitchenTimerState(
    prepTimeMinutes,
    startedAt,
    completedAt,
    now,
  )
  return (
    <span
      aria-live="polite"
      data-testid="kitchen-item-timer"
      data-state={timer.kind}
      className="font-semibold tabular-nums"
    >
      {timer.label}
    </span>
  )
}
