"use client";

import { create } from "zustand";

import type { Session } from "@/lib/auth/session";

export type AuthStatus = "hydrating" | "authenticated" | "unauthenticated";

type AuthState = {
  accessToken: string | null;
  session: Session | null;
  status: AuthStatus;
  setAccessToken: (accessToken: string | null) => void;
  setSession: (session: Session | null) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
  hydrate: (scope?: "tenant" | "platform") => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  session: null,
  status: "hydrating",
  setAccessToken: (accessToken) => set({ accessToken }),
  setSession: (session) => set({ session }),
  setStatus: (status) => set({ status }),
  clear: () =>
    set({ accessToken: null, session: null, status: "unauthenticated" }),
  hydrate: async (requestedScope) => {
    const scope =
      requestedScope ??
      (typeof window !== "undefined" &&
      window.location.pathname.startsWith("/platform")
        ? "platform"
        : "tenant");
    set({ status: "hydrating" });

    try {
      if (scope === "platform") {
        set({ accessToken: null, session: null });
        const { getPlatformAuthSession } = await import("@/lib/api/client");
        const result = await getPlatformAuthSession();
        set({
          accessToken: result.accessToken,
          session: result.session,
          status: "authenticated",
        });
        return;
      }

      if (get().session?.scope !== "tenant") {
        set({ accessToken: null, session: null });
      }
      let accessToken = get().accessToken;
      if (!accessToken) {
        const refreshed = await import("@/lib/api/client").then(
          ({ refreshAccessToken }) => refreshAccessToken(),
        );
        if (!refreshed) {
          set({ status: "unauthenticated" });
          return;
        }
        accessToken = get().accessToken;
      }

      const session = await import("@/lib/auth/session").then(
        ({ getSession }) => getSession(accessToken),
      );
      if (session.scope !== "tenant") {
        throw new Error("Tenant authentication required");
      }
      set({
        session,
        status: session ? "authenticated" : "unauthenticated",
      });
    } catch {
      set({ accessToken: null, session: null, status: "unauthenticated" });
    }
  },
}));
