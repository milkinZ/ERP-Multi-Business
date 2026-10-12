import type { ReactNode } from "react"
import React from "react"
import { AppShell } from "@/components/layout/app-shell"
import { AuthGuard } from "@/components/auth/auth-guard"

export default function PlatformLayout({ children }: { children: ReactNode }) {
	return (
		<AuthGuard scope="platform">
			<AppShell surface="platform">{children}</AppShell>
		</AuthGuard>
	)
}
