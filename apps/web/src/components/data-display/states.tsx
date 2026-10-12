import React, { type ReactNode } from "react"

type Tone = "neutral" | "success" | "warning" | "danger" | "info"

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 rounded-[28px] border border-[var(--border)] bg-[var(--panel)]/90 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-sm sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--primary)]">{eyebrow}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-[var(--muted-foreground)]">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--muted)] text-lg text-[var(--primary)]">•</div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{description}</p>
        </div>
      </div>
    </section>
  )
}

export function UnavailableState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-[24px] border border-[var(--border)] bg-[var(--panel)] p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--muted)] text-xl text-[var(--primary)]">!</div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--primary)]">Unavailable</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">{description}</p>
        </div>
      </div>
    </section>
  )
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const toneClasses: Record<Tone, string> = {
    neutral: "bg-[var(--muted)] text-[var(--foreground)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "bg-[var(--platform-soft)] text-[var(--platform)]",
  }

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${toneClasses[tone]}`}>{children}</span>
}

export function MetricCard({ title, value, detail, tone = "info" }: { title: string; value: string; detail: string; tone?: Tone }) {
  const toneClasses: Record<Tone, string> = {
    neutral: "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)]",
    success: "border-[rgba(15,159,110,0.2)] bg-[var(--success-soft)] text-[var(--success)]",
    warning: "border-[rgba(217,119,6,0.2)] bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "border-[rgba(209,67,67,0.2)] bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "border-[rgba(29,78,216,0.15)] bg-[var(--platform-soft)] text-[var(--platform)]",
  }

  return (
    <article className={`rounded-[22px] border p-5 shadow-[0_10px_30px_rgba(15,23,42,0.03)] ${toneClasses[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-75">{title}</p>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <strong className="text-3xl font-semibold tracking-tight">{value}</strong>
      </div>
      <p className="mt-3 text-sm opacity-80">{detail}</p>
    </article>
  )
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">{eyebrow}</p> : null}
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
      </div>
      {action}
    </div>
  )
}
