# Gap Closure Dependency Map

## Dependency flow

```mermaid
flowchart TD
    A[Build/typecheck pass; migration & deployment verification open] --> B[Webhook security + auth/RBAC validation]
    B --> C[Financial contract closure]
    C --> D[Transaction + concurrency hardening]
    D --> E[Platform audit + billing contracts]
    E --> F[Operational observability and worker safety]
    F --> G[Frontend contract consumption]
    G --> H[E2E and regression coverage]
    H --> I[Release gate]

    C --> J[Subscription lifecycle contract]
    J --> G

    A --> K[Migration safety review]
    K --> I

    E --> L[Platform settings contract]
    L --> G
```

## Blocking dependencies

### Payment security dependency chain

- SEC-001 resolved using the documented Xendit `x-callback-token` contract; provision the secret in production
- SEC-003 final auth/RBAC and tenant-boundary review remains open
- Financial mutation hardening required
- DATA-001 invoice numbering is resolved
- Audit verification required
- E2E flow validation required

### Platform admin dependency chain

- API-001 platform billing aggregate contract is resolved
- Frontend dashboard cannot render trustworthy financial views
- ARCH-001 platform audit/outbox/mutation transaction boundary is resolved for reviewed operations
- API-002 remains scope-limited with unsupported financial operations unavailable
- UI surfaces must remain explicit about unsupported functions until contract is added

### Worker / observability dependency chain

- Worker registry, heartbeat, durable job projection, and authorized worker read endpoints exist (OPS-001 RESOLVED WITH GAP)
- Job-history query, scheduler execution-history, and DLQ contracts remain absent
- Retry-series integration evidence needs stabilization
- Monitoring and alert policy remain external to the application

### Deployment dependency chain

- Root build and typecheck currently pass; DEP-001 is RESOLVED WITH GAP pending non-mutating lint/release evidence
- Production migration ordering, backup/restore, and schema-drift behavior remain unvalidated (OPS-002)
- Release safety still requires an environment-specific deployment procedure

## Important execution rule

The backlog must not be implemented in severity order alone. Contract work precedes frontend work; concurrency hardening precedes UI expansion; security verification precedes financial workflow expansion.
