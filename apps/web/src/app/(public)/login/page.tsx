"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { apiRequest } from "@/lib/api/client"
import { useAuthStore } from "@/stores/auth.store"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
})

type LoginValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const setAccessToken = useAuthStore((state) => state.setAccessToken)
  const status = useAuthStore((state) => state.status)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/app/dashboard")
    }
  }, [router, status])

  async function submit(values: LoginValues) {
    setError(null)

    try {
      const result = await apiRequest<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      })

      setAccessToken(result.accessToken)
      useAuthStore.getState().setStatus("authenticated")
      await useAuthStore.getState().hydrate()
      router.push("/app/dashboard")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in")
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
      <div className="grid w-full overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),linear-gradient(180deg,#0b3b78_0%,#10213e_100%)] p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-100/80">ERP Multi-Business</p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight">Operate every business line from one control surface.</h1>
          </div>
          <div className="space-y-4 text-sm text-blue-100/85">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">Platform + tenant separation</p>
              <p className="mt-1">Backend permissions keep platform administration distinct from ERP user access.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-semibold text-white">Operational visibility</p>
              <p className="mt-1">Track health, tenants, inventory, orders, and subscriptions from a single experience.</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Welcome back</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Sign in</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your tenant credentials. Platform access remains separate and permission-driven by the backend.
            </p>

            <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-5">
              <label className="block text-sm font-medium text-foreground">
                Email
                <input
                  {...register("email")}
                  type="email"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {errors.email && <span className="mt-1 block text-xs text-destructive">{errors.email.message}</span>}
              </label>

              <label className="block text-sm font-medium text-foreground">
                Password
                <input
                  {...register("password")}
                  type="password"
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring"
                />
                {errors.password && <span className="mt-1 block text-xs text-destructive">{errors.password.message}</span>}
              </label>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
