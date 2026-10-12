"use client"

import { create } from "zustand"

import type { Session } from "@/lib/auth/session"

export type AuthStatus = "hydrating" | "authenticated" | "unauthenticated"

type AuthState = {
	accessToken: string | null
	session: Session | null
	status: AuthStatus
	setAccessToken: (accessToken: string | null) => void
	setSession: (session: Session | null) => void
	setStatus: (status: AuthStatus) => void
	clear: () => void
	hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
	accessToken: null,
	session: null,
	status: "hydrating",
	setAccessToken: (accessToken) => set({ accessToken }),
	setSession: (session) => set({ session }),
	setStatus: (status) => set({ status }),
	clear: () => set({ accessToken: null, session: null, status: "unauthenticated" }),
	hydrate: async () => {
		try {
			let accessToken = get().accessToken
			if (!accessToken) {
				const refreshed = await import("@/lib/api/client").then(({ refreshAccessToken }) => refreshAccessToken())
				if (!refreshed) {
					set({ status: "unauthenticated" })
					return
				}
				accessToken = get().accessToken
			}

			const session = await import("@/lib/auth/session").then(({ getSession }) => getSession(accessToken))
			set({
				session,
				status: session ? "authenticated" : "unauthenticated",
			})
		} catch {
			set({ accessToken: null, session: null, status: "unauthenticated" })
		}
	},
}))
