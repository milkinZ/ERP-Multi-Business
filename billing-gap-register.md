# Billing Gap Register

## Verified Backend Contract

- Tenant invoice list: `GET /billing/invoices?skip=&take=` (`invoice.read`)
- Tenant invoice detail: `GET /billing/invoices/:id` (`invoice.read`)
- Tenant CSV export: `GET /billing/invoices-export.csv?from=&to=&status=` (`invoice.read`); streamed in stable, bounded database pages.
- Tenant pending invoice cancellation: `POST /billing/invoices/:id/cancel` (`billing.execute`); cancellation is rejected when a provider payment is active or unresolved.
- Execute billing: `POST /billing/execute/:subscriptionId` (`billing.execute`)
- Renew subscription: `POST /billing/renew/:subscriptionId` (`billing.execute`)
- Current subscription context: `GET /subscriptions/current` (`subscription.read`)
- Platform invoice list: `GET /super-admin/invoices` (`super-admin.read`)
- Platform invoice detail: `GET /super-admin/invoices/:id` (`super-admin.read`)
- Platform CSV export: `GET /super-admin/invoices-export.csv?from=&to=&status=` (`super-admin.read`); streamed and audited before output.
- Platform invoice responses expose only verified invoice fields and a tenant `{ id, name }` summary.

## Verified Platform Boundary

- Platform invoice reads use the existing `JwtAuthGuard` and `PermissionGuard` with `super-admin.read`.
- Tenant billing endpoints remain scoped by `TenantContextService.requireTenant()` and are not called by the platform UI.
- No platform billing mutation endpoint exists. `super-admin.manage.billing` is defined but is not attached to a billing controller action.
- `Invoice.subscriptionId` is an optional scalar without a Prisma relation; the platform UI links to the existing subscription route only when that identifier is present.

## Confirmed Gaps

### API-002 status: RESOLVED WITH GAP

Supported billing includes invoice list/detail, billing execution/renewal, tenant cancellation of a pending invoice with no active or unresolved provider payment, and filtered tenant/platform CSV exports. Platform exports are audited; CSV output is streamed, paged with a stable cursor, and neutralizes spreadsheet formula cells.

Refund and reconciliation remain unavailable. Refund initiation still requires a channel-aware provider contract, durable no-retry handling for ambiguous outcomes, and verified terminal status updates. No PDF export or platform billing mutation is exposed.
The payment gateway contract does not expose a refund operation; the prior Xendit stub that returned a synthetic failed result was removed so unsupported refunds cannot appear as a callable capability. Provider charge input now rejects non-positive, fractional, or unsafe cent amounts before making a request.

### BACKEND CONTRACT GAP

- No invoice payment endpoint exists. The frontend does not treat invoice existence as payment.
- Paid invoices cannot be cancelled; the tenant can only cancel pending invoices that have no active/unresolved provider payment request.
- No PDF export exists.
- No billing summary endpoint exists beyond invoice pagination and current subscription data.
- No invoice status enum, tax, discount, subtotal, balance, or payment relation is exposed by the Invoice model.
- No platform invoice filtering by tenant, subscription, status, or date is exposed.
- No platform billing history, reconciliation, refund, cancellation, or PDF contract is exposed.
- No platform-safe execute-billing or renewal endpoint exists; tenant billing endpoints must remain tenant-scoped.

### FINANCIAL SAFETY GAP

- Billing execution derives a stable subscription-and-month idempotency key, enforces it with a unique database index, and commits the invoice and required outbox events in one transaction. Repeated or concurrent calls for the same period return without creating duplicate invoices/events; renewal also persists its period end so a repeated renewal does not duplicate lifecycle history. The frontend still uses mutation retry `0` and warns when a failed request may have an unknown result.
- Invoice number generation is backend-owned and now uses a PostgreSQL-backed transactional counter in the same database transaction as invoice creation. This closes the previous count-based race and preserves the existing global `INV-YYYYMM-######` format with database-level uniqueness enforcement.

### SECURITY GAP

- SEC-001 is resolved for the integrated Xendit Payments API v3 Payment Request webhook contract. Xendit documents `x-callback-token` as the webhook origin-verification token and recommends comparing it with the secret from Dashboard webhook settings. `WebhookController` verifies this header before invoking billing processing, and missing or invalid configuration/header values fail closed.
- The documented contract does not specify HMAC verification or a signed timestamp. Duplicate/replayed delivery is handled by the existing payment/capture-derived idempotency key and unique durable receipt; event timestamps are payload data, not an authentication mechanism.
- The platform read surface continues not to expose payment-provider payloads, credentials, or mutation controls.

Official contract references: [Create a payment request](https://docs.xendit.co/apidocs/create-payment-request) (`POST /v3/payment_requests`, Payments API v3); [Payment webhook notification](https://docs.xendit.co/apidocs/payment-webhook-notification) (`POST /your_payment_webhook_url`, `x-callback-token`, event and payment payload); and [Integration security](https://docs.xendit.co/docs/integration-security) (verify the callback token and validate payment IDs, amount, and status). The production deployment must configure `XENDIT_WEBHOOK_TOKEN` to the token registered in Xendit Dashboard.

### ARCHITECTURE GAP

- The billing domain has tenant-scoped services and repositories only. A future platform billing mutation workflow needs an explicit cross-tenant authorization and transaction boundary rather than passing a platform-supplied `tenantId` into tenant billing services.

### REALTIME INFRASTRUCTURE GAP

- No frontend billing realtime contract is exposed; billing realtime remains deferred.

### TEST INFRASTRUCTURE GAP

- No dedicated frontend Billing test harness is currently present.
