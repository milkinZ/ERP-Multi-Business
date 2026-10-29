"use client";

import React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { startPlatformLogin } from "@/lib/api/client";

export default function PlatformLoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-12">
      <section className="w-full max-w-xl rounded-[28px] border border-border bg-card p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-12">
        <Link
          href="/"
          className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary"
        >
          ERP Multi-Business
        </Link>
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.24em] text-primary">
          Platform control plane
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Administrator sign in
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Continue with your provisioned organization identity. Platform access
          requires your identity provider to verify MFA.
        </p>
        <Button
          type="button"
          className="mt-8 w-full"
          onClick={startPlatformLogin}
        >
          Continue with organization SSO
        </Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need tenant access?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary hover:underline"
          >
            Tenant sign in
          </Link>
        </p>
      </section>
    </div>
  );
}
