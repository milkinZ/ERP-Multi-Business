import Link from "next/link"
import React from "react"

export default function Page() {
  return (
    <main className="min-h-screen overflow-hidden">
      <section className="relative isolate border-b border-[var(--border)] px-6 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_76%_18%,rgba(37,99,235,0.24),transparent_26%),linear-gradient(135deg,#edf5ff_0%,#f8fbff_52%,#dcecff_100%)]" />
        <nav className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--platform)] text-xs font-bold tracking-[0.16em] text-white">ERP</span>
            <span className="text-sm font-bold tracking-[0.14em] text-[var(--foreground)]">MULTI-BUSINESS</span>
          </Link>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <a href="#capabilities" className="hidden text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] sm:inline">Capabilities</a>
            <a href="/login" className="rounded-lg border border-[var(--border)] bg-white/70 px-4 py-2 text-[var(--foreground)] transition hover:border-[var(--primary)]">Sign in</a>
          </div>
        </nav>

        <div className="mx-auto grid max-w-7xl gap-14 pb-8 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-28">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--primary)]">One operating layer for every business line</p>
            <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-[var(--foreground)] sm:text-7xl">Run the work behind the growth.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted-foreground)]">ERP Multi-Business brings tenant operations, platform administration, orders, inventory, and catalog workflows into one focused control surface.</p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="/register" className="rounded-xl bg-[var(--primary)] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(29,78,216,0.24)] transition hover:-translate-y-0.5">Create an account</a>
              <a href="#capabilities" className="rounded-xl border border-[var(--border)] bg-white/70 px-5 py-3 text-sm font-bold text-[var(--foreground)] transition hover:border-[var(--primary)]">Explore the platform</a>
            </div>
            <p className="mt-5 text-xs text-[var(--muted-foreground)]">Built for teams that need operational clarity without losing business context.</p>
          </div>

          <div className="relative rounded-[28px] border border-white/80 bg-[rgba(255,255,255,0.72)] p-4 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur">
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel)] p-5">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-5">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Operations snapshot</p><p className="mt-1 text-lg font-semibold">Northstar workspace</p></div>
                <span className="h-3 w-3 rounded-full bg-[var(--success)] shadow-[0_0_0_5px_var(--success-soft)]" />
              </div>
              <div className="grid gap-3 py-5 sm:grid-cols-3">
                {["Orders", "Products", "Inventory"].map((label, index) => <div key={label} className="rounded-xl bg-[var(--panel-alt)] p-3"><p className="text-xs text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-xl font-semibold">{["128", "2,430", "94%"][index]}</p><p className="mt-1 text-[10px] font-semibold text-[var(--success)]">Live workspace view</p></div>)}
              </div>
              <div className="rounded-xl bg-[var(--platform)] p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">Control plane</p><p className="mt-2 text-lg font-semibold">Tenant and platform scopes stay distinct.</p><p className="mt-2 text-sm leading-6 text-blue-100">Keep daily operations close while administration remains permission-driven.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-16">
        <div className="max-w-2xl"><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--primary)]">The operating model</p><h2 className="mt-4 text-4xl font-semibold tracking-tight">Less tab switching. More informed action.</h2><p className="mt-4 text-base leading-7 text-[var(--muted-foreground)]">The product is organized around the places work actually happens, with clear boundaries between tenant operations and platform control.</p></div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[{ number: "01", title: "Tenant operations", text: "Work with catalog, orders, inventory, and the daily workflows that keep each business moving." }, { number: "02", title: "Platform control", text: "Keep cross-tenant administration, readiness, and platform visibility in a separate control plane." }, { number: "03", title: "Authoritative access", text: "Session context, permissions, and tenant scope come from the backend that owns the rules." }].map((item) => <article key={item.number} className="border-t-2 border-[var(--primary)] pt-5"><p className="text-xs font-bold tracking-[0.2em] text-[var(--primary)]">{item.number}</p><h3 className="mt-5 text-xl font-semibold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-[var(--muted-foreground)]">{item.text}</p></article>)}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--platform)] px-6 py-16 text-white sm:px-10 lg:px-16"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-200">Ready when your operation is</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">Start with the workspace your backend already understands.</h2></div><a href="/register" className="inline-flex shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[var(--platform)] transition hover:bg-blue-50">Get started</a></div></section>
      <footer className="mx-auto flex max-w-7xl justify-between px-6 py-8 text-xs text-[var(--muted-foreground)] sm:px-10 lg:px-16"><span>ERP Multi-Business</span><span>Tenant operations and platform administration</span></footer>
    </main>
  )
}


