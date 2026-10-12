# Platform Settings Gap Register

## Audit Findings

- The API uses NestJS `ConfigModule` and environment-backed `ConfigService` for database, Redis, JWT, storage, observability, logging, and application configuration.
- No `PlatformSettings`, `SystemConfig`, or `SettingsService` contract exists.
- No platform-global settings Prisma model exists before this task.
- Existing `FeatureFlag` records are tenant-scoped and must not be presented as platform settings.
- `/platform/settings` existed as an unavailable shell; `/app/settings` remains tenant settings and is also unaudited/unavailable.
- Existing platform authorization uses `JwtAuthGuard`, `PermissionGuard`, and `super-admin.*` permissions. No settings-specific permission exists.
- `PlatformAuditLog` exists for platform mutations, but no settings mutation exists to audit.

## Implemented Safe Scope

- `/platform/settings` now presents an explicit unavailable state behind the existing platform authentication and `super-admin.read` UX check.
- No environment variable is editable from the browser.
- No secret or configuration value is returned to the frontend.
- No fake setting key, default, validation rule, persistence model, or mutation endpoint was introduced.

## Gaps

### BACKEND CONTRACT GAP

- No supported database-backed platform setting key/value contract exists.
- No server-side setting validation or runtime reload semantics exist.
- No platform settings list/detail/update endpoints exist.

### SECURITY GAP

- Environment configuration contains secrets and is not suitable for browser exposure or web editing. Any future settings contract must explicitly whitelist non-secret values and reject arbitrary keys.

### ARCHITECTURE GAP

- A future editable settings system needs a platform-global storage model, typed validation, concurrency semantics, runtime consumption/cache invalidation, and atomic `PlatformAuditLog` persistence.

### OPERATIONAL GAP

- Deployment configuration changes currently require deployment/environment management outside the platform UI.

### FRONTEND GAP

- No editable settings controls exist because no authoritative backend contract supports them.

### TEST INFRASTRUCTURE GAP

- No platform settings API or frontend settings test contract exists yet.
