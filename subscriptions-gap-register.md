# Subscriptions Gap Register

## Verified Contract

- `GET /subscriptions/current` with `subscription.read` returns the current tenant subscription.
- Response fields are `id`, `tenantId`, `planId`, `status`, `planType`, `priceCents`, `startedAt`, and `endedAt`.
- Subscription reads derive tenant scope from the authenticated backend context.
- Billing actions remain exposed by the Billing module and are not duplicated here.
- `GET /super-admin/subscriptions` and `GET /super-admin/subscriptions/:id` are platform-scoped reads protected by `super-admin.read` and return explicit subscription, plan, and tenant-summary fields.
- `PUT /super-admin/tenants/:tenantId/plan` is the only verified platform subscription mutation and is protected by `super-admin.manage.subscriptions`.
- The platform UI is available at `/platform/subscriptions` and `/platform/subscriptions/:subscriptionId` using those contracts.

## Confirmed Gaps

### BACKEND CONTRACT GAP

- No frontend-supported plan catalog or plan comparison endpoint was verified for tenant users.
- No tenant-facing upgrade, downgrade, resume, pause, or subscription termination workflow is exposed for this UI.
- No usage limits, feature entitlements, billing cycle, renewal date, trial dates, currency, or payment relationship are returned by the current subscription response.
- Subscription history is not exposed by the current tenant subscription contract.
- No platform subscription lifecycle mutation endpoint is exposed for activate, suspend, cancel, renew, or execute-billing actions; the platform UI intentionally does not show those controls.
- Platform billing and invoice navigation remains unavailable because no cross-tenant billing detail contract was verified for a subscription detail record.

### ARCHITECTURE GAP

- Platform plan changes are orchestrated by the Super Admin module and persist the target `planId` directly; the existing platform contract does not expose a transaction boundary that also persists the subscription domain event through `SubscriptionService`.

### SECURITY GAP

- Cross-tenant platform reads rely on the existing `super-admin.read` permission guard. No separate subscription-specific platform permission exists; introducing one would require a coordinated permission seed and role migration.

### FINANCIAL SAFETY GAP

- Subscription page intentionally does not duplicate billing mutations. Execute and renew remain in Billing with mutation retry disabled and unknown-result handling.

### REALTIME INFRASTRUCTURE GAP

- No frontend subscription realtime contract is exposed; status updates depend on query refetch.

### TEST INFRASTRUCTURE GAP

- No dedicated frontend component test runner is currently configured for subscription UI behavior.