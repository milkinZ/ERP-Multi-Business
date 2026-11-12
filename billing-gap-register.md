# Billing Gap Register

## Verified Backend Contract

- Tenant invoice list: `GET /billing/invoices?skip=&take=` (`invoice.read`)
- Tenant invoice detail: `GET /billing/invoices/:id` (`invoice.read`)
- Tenant CSV export: `GET /billing/invoices-export.csv?from=&to=&status=` (`invoice.read`); streamed in stable, bounded database pages.
- Tenant pending invoice cancellation: `POST /billing/invoices/:id/cancel` (`billing.execute`); cancellation is rejected when a provider payment is active or unresolved.
- Tenant refund history and initiation: `GET/POST /billing/invoices/:id/refunds`; amount is bounded by the paid balance and pending/unknown refunds reserve funds until the provider webhook resolves them.
- Tenant Autopay status, enrollment, and local revocation: `GET/DELETE /billing/autopay` and consent-gated `POST /billing/invoices/:id/payment-request/autopay`. Enrollment creates a CARDS-only hosted Payment Session and recurring charges use its saved payment token.
- Execute billing: `POST /billing/execute/:subscriptionId` (`billing.execute`)
- Renew subscription: `POST /billing/renew/:subscriptionId` (`billing.execute`)
- Current subscription context: `GET /subscriptions/current` (`subscription.read`)
- Platform invoice list: `GET /super-admin/invoices` (`super-admin.read`)
- Platform invoice detail: `GET /super-admin/invoices/:id` (`super-admin.read`)
- Platform invoice refund history: `GET /super-admin/billing/tenants/:tenantId/invoices/:invoiceId/refunds` (`super-admin.read`)
- Platform invoice cancellation and refund: tenant-scoped `POST /super-admin/billing/tenants/:tenantId/invoices/:invoiceId/{cancel,refunds}` (`super-admin.manage.billing`); mutations require explicit confirmation and are audited.
- Platform CSV export: `GET /super-admin/invoices-export.csv?from=&to=&status=` (`super-admin.read`); streamed and audited before output.
- Platform invoice responses expose only verified invoice fields and a tenant `{ id, name }` summary.

## Verified Platform Boundary

- Platform invoice reads use the existing `JwtAuthGuard` and `PermissionGuard` with `super-admin.read`.
- Tenant billing endpoints remain scoped by `TenantContextService.requireTenant()` and are not called by the platform UI.
- Platform billing mutations run under a server-selected tenant context; the client cannot choose a tenant scope for the underlying tenant BillingService call.
- `Invoice.subscriptionId` is an optional scalar without a Prisma relation; the platform UI links to the existing subscription route only when that identifier is present.

## Confirmed Gaps

### API-002 status: RESOLVED WITH GAPS

Supported billing includes tenant and platform invoice list/detail, filters and audited CSV exports, billing execution/renewal, safe pending-invoice cancellation, provider refund initiation/history, and the Autopay/token lifecycle. Refunds use a durable ledger, reserve pending/unknown amounts, and update invoice status only after authenticated provider terminal webhooks; ambiguous provider outcomes are not retried automatically.
Remaining gaps include provider-side token revocation (no verified provider contract is implemented), payment reconciliation, tax/credit notes, PDF export, PostgreSQL validation of the hosted Payment Session webhook path, and live Xendit account verification.

### BACKEND CONTRACT GAP

- Autopay uses explicit tenant consent/version tracking and Xendit Payment Sessions (`PAY` + `PAYMENT_LINK` + `allow_save_payment_method: FORCED`) limited to `CARDS`. Card details are entered only on Xendit's hosted page; the application never receives raw card data. The `payment_session.completed` event activates the encrypted payment token, `payment_session.expired` ends abandoned enrollment, and the standard payment capture webhook correlates the first invoice charge by enrollment reference. Recurring `PAY` requests use the saved token ID.
- Operator settings expose an Autopay toggle and a validated allowlist of MIT channel codes. Charges are scheduled every five minutes and limited to three attempts total within seven days; retries are one day apart. Unknown provider outcomes are not retried automatically.
- Revocation immediately disables future ERP-initiated charges and removes the locally encrypted token. Provider-side token revocation is reported as unsupported until a verified Xendit contract is available.
- Paid invoices cannot be cancelled; the tenant can only cancel pending invoices that have no active/unresolved provider payment request.
- No PDF export exists.
- Tax, credit-note, reconciliation, and PDF contracts remain absent. Refund status is represented in the invoice and refund ledger.
- Platform invoice filtering by tenant, subscription, status, and date is available; platform cancellation/refund actions are available with explicit confirmation and audit records.
- Platform-safe execute/renew actions are permission-gated and invoke billing under the server-selected tenant context.

### FINANCIAL SAFETY GAP

- Billing execution derives a stable subscription-and-month idempotency key, enforces it with a unique database index, and commits the invoice and required outbox events in one transaction. Repeated or concurrent calls for the same period return without creating duplicate invoices/events; renewal also persists its period end so a repeated renewal does not duplicate lifecycle history. The frontend still uses mutation retry `0` and warns when a failed request may have an unknown result.
- Invoice number generation is backend-owned and now uses a PostgreSQL-backed transactional counter in the same database transaction as invoice creation. This closes the previous count-based race and preserves the existing global `INV-YYYYMM-######` format with database-level uniqueness enforcement.
- Refund amount reservation locks the invoice row; provider webhook settlement locks the same row before aggregating successful refunds, preventing concurrent refunds from exceeding the payment or losing cumulative refunded totals.

### SECURITY GAP

- SEC-001 is resolved for the integrated Xendit Payments API v3 Payment Request webhook contract. Xendit documents `x-callback-token` as the webhook origin-verification token and recommends comparing it with the secret from Dashboard webhook settings. `WebhookController` verifies this header before invoking billing processing, and missing or invalid configuration/header values fail closed.
- The documented contract does not specify HMAC verification or a signed timestamp. Duplicate/replayed delivery is handled by the existing payment/capture-derived idempotency key and unique durable receipt; event timestamps are payload data, not an authentication mechanism.
- The platform read surface omits provider credentials and raw payloads. Mutations expose only confirmed refund/cancellation inputs and record operator audit intent.
- `XENDIT_TOKEN_ENCRYPTION_KEYS` and `XENDIT_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION` must be supplied from a secret manager; old key versions must remain available until all tokens encrypted with them are re-encrypted or revoked. The repository does not contain or rotate Xendit credentials.

Official contract references: [Create a Payment Session](https://docs.xendit.co/apidocs/create-session) (`POST /sessions`); [Payment Sessions overview](https://docs.xendit.co/docs/payment-sessions-overview); [Pay and Save](https://docs.xendit.co/docs/pay-and-save); [Payment webhook notification](https://docs.xendit.co/apidocs/payment-webhook-notification) (`x-callback-token`, event and payment payload); and [Integration security](https://docs.xendit.co/docs/integration-security) (verify the callback token and validate payment IDs, amount, and status). Configure the Xendit Dashboard to deliver `payment_session.completed`, `payment_session.expired`, and payment capture/failure events to `/webhooks/payments`; the production deployment must configure `XENDIT_WEBHOOK_TOKEN` to the registered callback token.

### ARCHITECTURE GAP

- Platform billing mutations use a dedicated permission plus an audited server-side tenant context; tenant services still derive tenant scope from `TenantContextService`.

### REALTIME INFRASTRUCTURE GAP

- No frontend billing realtime contract is exposed; billing realtime remains deferred.

### TEST INFRASTRUCTURE GAP

- Unit tests cover Autopay cryptography, unknown-outcome retry blocking, hosted Payment Session payloads, and session/token webhook routing. PostgreSQL verification of session-to-invoice correlation, deployment of the migration, live Xendit verification, and a dedicated frontend Billing test harness remain outstanding.
- Rotate any previously exposed Xendit API/callback credentials in the Xendit Dashboard and deployment secret manager, then redeploy; this external operation has not been performed from this repository.
