"use client"

import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import {
  getKitchenAnalytics,
  kitchenKeys,
  type KitchenOutlet,
  type KitchenStation,
} from "@/features/erp/kitchen/api/queries"

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—"
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

export function KitchenAnalyticsPanel({
  tenantId,
  accessToken,
  outlets,
  stations,
  outletId: scopedOutletId,
}: {
  tenantId: string
  accessToken: string
  outlets: KitchenOutlet[]
  stations: KitchenStation[]
  outletId: string | null
}) {
  const today = new Date().toISOString().slice(0, 10)
  const previousMonth = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const [startDate, setStartDate] = useState(previousMonth)
  const [endDate, setEndDate] = useState(today)
  const [outletFilter, setOutletFilter] = useState(scopedOutletId ?? "")
  const [stationFilter, setStationFilter] = useState("")
  const filters = {
    startDate,
    endDate,
    ...(scopedOutletId || outletFilter
      ? { outletId: scopedOutletId ?? outletFilter }
      : {}),
    ...(stationFilter ? { stationId: stationFilter } : {}),
  }
  const query = useQuery({
    queryKey: kitchenKeys.analytics(tenantId, filters),
    queryFn: () => getKitchenAnalytics(accessToken, filters),
    enabled: Boolean(startDate && endDate),
  })

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Kitchen analytics</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ticket volume, queue wait, cook duration, and item-level preparation SLA.
      </p>
      <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-muted-foreground">
          From
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          To
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
        </label>
        {!scopedOutletId ? (
          <label className="text-xs font-medium text-muted-foreground">
            Outlet
            <select
              value={outletFilter}
              onChange={(event) => setOutletFilter(event.target.value)}
              className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
            >
              <option value="">All outlets</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs font-medium text-muted-foreground">
          Station
          <select
            value={stationFilter}
            onChange={(event) => setStationFilter(event.target.value)}
            className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="">All stations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </select>
        </label>
      </div>
      {query.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading Kitchen analytics…</p>
      ) : query.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {query.error instanceof ApiError
            ? query.error.message
            : "Kitchen analytics could not be loaded."}
        </p>
      ) : query.data ? (
        <>
          <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm font-semibold text-foreground">
            {query.data.totalTickets} tickets released in this date range
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Station</th>
                  <th className="px-3 py-2">Tickets</th>
                  <th className="px-3 py-2">Avg wait</th>
                  <th className="px-3 py-2">Avg cook</th>
                  <th className="px-3 py-2">SLA on target</th>
                </tr>
              </thead>
              <tbody>
                {query.data.stations.map((station) => (
                  <tr
                    key={station.stationId ?? "unassigned"}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-3 font-medium text-foreground">{station.stationName}</td>
                    <td className="px-3 py-3">{station.ticketCount}</td>
                    <td className="px-3 py-3">{formatDuration(station.averageWaitSeconds)}</td>
                    <td className="px-3 py-3">{formatDuration(station.averageCookSeconds)}</td>
                    <td className="px-3 py-3">
                      {station.slaPercent === null
                        ? "No completed timed items"
                        : `${station.slaPercent}% (${station.onTimeItems}/${station.timedItems})`}
                    </td>
                  </tr>
                ))}
                {!query.data.stations.length ? (
                  <tr><td className="px-3 py-4 text-muted-foreground" colSpan={5}>No tickets in this date range.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
