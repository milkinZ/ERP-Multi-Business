import type { ReactNode } from "react"
import React from "react"
import { AppShell } from "@/components/layout/app-shell"
import { AuthGuard } from "@/components/auth/auth-guard"

export default function ErpLayout({ children }: { children: ReactNode }) {
	return (
		<AuthGuard scope="erp">
			<AppShell surface="erp">{children}</AppShell>
		</AuthGuard>
	)
}
