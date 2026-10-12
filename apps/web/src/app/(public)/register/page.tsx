"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { apiRequest } from "@/lib/api/client"

const registerSchema = z.object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Use at least 8 characters"),
    tenantId: z.string().min(1, "Enter the tenant ID provided by your administrator"),
    roleId: z.string().min(1, "Enter the role ID provided by your administrator"),
    outletId: z.string().optional(),
})

type RegisterValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [complete, setComplete] = useState(false)
    const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

    async function submit(values: RegisterValues) {
        setError(null)
        try {
            await apiRequest("/auth/register", { method: "POST", body: JSON.stringify({ ...values, outletId: values.outletId || undefined }) })
            setComplete(true)
            window.setTimeout(() => router.push("/login"), 1200)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to create the account")
        }
    }

    return <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12"><div className="grid w-full overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[0.9fr_1.1fr]"><div className="hidden bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.2),transparent_34%),linear-gradient(180deg,#0b3b78_0%,#10213e_100%)] p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between"><div><Link href="/" className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-100/80">ERP Multi-Business</Link><h1 className="mt-6 text-4xl font-semibold tracking-tight">Create access to the operation you already run.</h1></div><p className="text-sm leading-6 text-blue-100/80">Registration uses the tenant and role scope assigned by your administrator. The backend remains the source of truth for access.</p></div><div className="p-6 sm:p-8 lg:p-10"><div className="mx-auto max-w-md"><Link href="/" className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Back to overview</Link><h2 className="mt-4 text-3xl font-semibold tracking-tight">Create account</h2><p className="mt-2 text-sm text-muted-foreground">Use the tenant and role identifiers provided for your workspace.</p>{complete ? <div className="mt-8 rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-4 text-sm text-[var(--foreground)]">Account created. Taking you to sign in...</div> : <form onSubmit={handleSubmit(submit)} className="mt-8 space-y-4">{(["email", "password", "tenantId", "roleId", "outletId"] as const).map((field) => <label key={field} className="block text-sm font-medium text-foreground">{field === "outletId" ? "Outlet ID (optional)" : field === "tenantId" ? "Tenant ID" : field === "roleId" ? "Role ID" : field.charAt(0).toUpperCase() + field.slice(1)}<input {...register(field)} type={field === "password" ? "password" : field === "email" ? "email" : "text"} className="mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring" />{errors[field] && <span className="mt-1 block text-xs text-destructive">{errors[field]?.message}</span>}</label>)}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>{isSubmitting ? "Creating account..." : "Create account"}</Button></form>}<p className="mt-6 text-center text-sm text-muted-foreground">Already have access? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p></div></div></div></div>
}