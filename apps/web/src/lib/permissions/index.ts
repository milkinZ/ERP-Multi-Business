import type { Session } from "@/lib/auth/session";

export function hasPermission(
  session: Session | null | undefined,
  permission: string,
) {
  return Boolean(session?.permissions.includes(permission));
}

export function canAccessPlatform(session: Session | null | undefined) {
  return (
    session?.scope === "platform" && hasPermission(session, "super-admin.read")
  );
}
