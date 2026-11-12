# Subscriptions Gap Register

## Verified Contract

- `GET /subscriptions/current` with `subscription.read` returns the current tenant subscription and optional `pendingPlanId` plus `pendingPlanEffectiveAt: "NEXT_RENEWAL"`.
- Tenant plan changes are scheduled for the next renewal; the current `planId`, `planType`, and `priceCents` remain unchanged until then. Selecting the current plan cancels a pending change.
- Renewal applies the pending plan before emitting the plan-changed and subscription-renewed events and before generating the renewal invoice.
- Renewal stores the period end and is idempotent for the same billing period; invoice creation uses a unique subscription/month key, with the invoice and required outbox events committed atomically.
- Subscription reads derive tenant scope from the authenticated backend context.
- `GET /subscriptions/usage` reports plan entitlements, active/pending outlet and user counts, monthly orders, and over-limit orders. Outlet/user creation is blocked at approved limits; orders remain allowed and record overage.
- Plan entitlements are FREE (1 outlet/3 users/500 monthly orders), STARTER (3/10/5,000), BUSINESS (10/50/50,000), and ENTERPRISE (unlimited).
- Billing actions remain exposed by the Billing module and are not duplicated here.
- `GET /super-admin/subscriptions` and `GET /super-admin/subscriptions/:id` are platform-scoped reads protected by `super-admin.read` and return explicit subscription, plan, and tenant-summary fields.
- `PUT /super-admin/tenants/:tenantId/plan` is the only verified platform subscription mutation and is protected by `super-admin.manage.subscriptions`.
- Platform billing actions for subscription execution/renewal are protected by `super-admin.manage.billing`, confirmed explicitly, and run inside the server-selected tenant context.
- Tenant subscription and outbox changes persist in one database transaction. Failed persistence retains pending aggregate events for retry.
- Platform plan changes are also scheduled for the next renewal and persist the pending plan, platform audit, and scheduling outbox event in the same transaction.
- The platform UI is available at `/platform/subscriptions` and `/platform/subscriptions/:subscriptionId` using those contracts.
- `GET /subscriptions/:id/history` returns paginated tenant-scoped subscription history with event type, actor, timestamp, and sanitized metadata. The subscription must belong to the authenticated tenant.
- Tenant plan changes persist subscription state, outbox events, and safe history metadata atomically. Platform plan changes also persist `PLATFORM_USER` history in the same transaction as the plan schedule, audit record, and outbox event.
- History is available in the tenant subscription workspace; free-form reasons and sensitive values are excluded from history metadata.

## Confirmed Gaps

### BACKEND CONTRACT GAP

- Usage limits and monthly usage are available through the dedicated usage endpoint; they are not embedded into the current-subscription response.
- Billing execution and renewal are exposed to platform operators through the audited Billing workflow. Other subscription lifecycle mutation contracts (activate, suspend, cancel) remain unavailable.
- Recurring Autopay now supports tenant consent, AES-256-GCM token storage, operator-controlled MIT-channel allowlisting, scheduled retries (maximum three attempts within seven days), and local revocation. PostgreSQL concurrency verification and live provider verification remain outstanding; provider-side token revocation is not implemented because no verified provider contract is available.
- Platform invoice detail and refund history are available from the billing workspace; the subscription detail page does not yet link to a filtered invoice history.

### ARCHITECTURE GAP

- Tenant lifecycle updates and their outbox events are atomic. Plan scheduling and its scheduling event are atomic; application at renewal, the effective plan-change event, and renewal event are persisted together. Repeated renewal requests for an already renewed period do not append duplicate renewal history.
- Platform plan scheduling persists the pending plan, audit record, and outbox event atomically.
- Subscription history is durable and transactionally persisted for plan changes. Other lifecycle mutations do not yet have an approved history-event contract.

### SECURITY GAP

- Cross-tenant platform reads rely on the existing `super-admin.read` permission guard. No separate subscription-specific platform permission exists; introducing one would require a coordinated permission seed and role migration.

### FINANCIAL SAFETY GAP

- Subscription page intentionally does not duplicate billing mutations. Execute and renew remain in Billing with mutation retry disabled and unknown-result handling.
- Subscription plan quota enforcement and overage recording are implemented. Automatic recurring charges are gated on payment-token consent, encryption, operator-approved MIT channels, and bounded retry processing. Unknown payment outcomes are not retried automatically.

### REALTIME INFRASTRUCTURE GAP

- No frontend subscription realtime contract is exposed; status updates depend on query refetch.

### TEST INFRASTRUCTURE GAP

- PostgreSQL-backed aggregate/outbox failure coverage and API unit coverage exist for subscription persistence and lifecycle behavior. No dedicated frontend component test runner is currently configured for subscription UI behavior.
