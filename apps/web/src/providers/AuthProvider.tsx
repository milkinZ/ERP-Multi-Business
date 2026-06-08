'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearAccessToken, fetchMe, getAccessToken, setAccessToken } from '../lib/auth';

type AuthUser = {
  sub: string;
  tenantId: string;
  roleId: string;
  outletId?: string | null;
  permissions: string[];
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (args: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    const t = getAccessToken();
    setToken(t);
    if (!t) {
      setUser(null);
      return;
    }
    const me = await fetchMe(t);
    setUser(me);
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } catch {
        clearAccessToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();

  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      login: async ({ email, password }) => {
        // lazy import to avoid circular deps
        const { login } = await import('../lib/auth');
        const resp = await login({ email, password });
        setAccessToken(resp.accessToken);
        setToken(resp.accessToken);
        const me = await fetchMe(resp.accessToken);
        setUser(me);
      },
      logout: () => {
        clearAccessToken();
        setToken(null);
        setUser(null);
      },
      refreshMe,
    }),
    [token, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

