# Platform Settings Gap Register

## Audit Findings

- The API uses NestJS `ConfigModule` and environment-backed `ConfigService` for database, Redis, JWT, storage, observability, logging, and application configuration.
- `PlatformSetting` persists a server-owned allowlist; arbitrary keys and environment secrets are never returned or writable through this API.
- Existing `FeatureFlag` records remain tenant-scoped and are not presented as platform settings.
- `/platform/settings` is separate from tenant `/app/settings`.
- Reads require `super-admin.read`; changes require `super-admin.manage.system`.
- Each mutation is version-checked and the settings row plus `PlatformAuditLog` entry commit in one transaction.

## Implemented Scope

- Allowlisted fields: platform name, support email, support URL, default timezone, and default display currency.
- Defaults are explicit and safe; support fields may be cleared.
- Server-side validation rejects invalid emails, non-HTTPS support URLs, unsupported timezones, unsupported display currencies, and unknown keys.
- Version-based optimistic concurrency returns a conflict rather than silently overwriting a concurrent update.
- Audit metadata records the key and version transition without recording setting values.
- The display-currency setting does not change invoice/payment currency; billing remains IDR.
- The UI exposes these settings only to authorized platform users and never exposes environment configuration or secrets.

## Remaining Scope

- The settings contract provides persisted values and UI management; deployment secrets remain deployment-owned.
- Default currency remains presentation metadata and is not used to reinterpret or convert existing invoice amounts.
- Unit coverage verifies defaults, validation, audit behavior, stale versions, and concurrent first-write/update conflicts. Cross-environment migration rollout remains covered by deployment gate OPS-002.
