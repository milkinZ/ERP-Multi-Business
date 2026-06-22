# TODO (ERP Multi Business - Backend Roadmap)

## Phase 1 — Foundation Architecture
- [ ] Verify existing env/config/request-context/correlation id/logging/security/versioning/swagger/health infrastructure matches Phase 1.

## Phase 2 — Database Foundation
- [ ] Update Prisma schema: BaseEntity (`id`, `createdAt`, `updatedAt`, `deletedAt`) + soft delete on core entities.
- [ ] Add missing models: Session, AuditLog, Notification, FeatureFlag, Plan, Subscription, Invoice.
- [ ] Add join models or refactor RBAC relations to match Phase 2 requirements.
- [ ] Add tenant/outlet scoping enforcement layer (Prisma middleware or equivalent).
- [ ] Create and apply Prisma migration(s).
- [ ] Seed support (no breaking changes).


## Phase 3 — Redis Foundation
- [ ] Validate RedisModule/RedisService/health check integration.

## Phase 4 — Event Driven Foundation
- [ ] Validate outbox pattern end-to-end + OutboxEvent entity mapping.
- [ ] Domain event types align with business workflow.

## Phase 5 — BullMQ Foundation
- [ ] Validate queue constants/producers + retries/backoff/DLQ/monitoring.

## Phase 7+ — Auth/RBAC/Tenant/etc.
- [ ] Proceed phase-by-phase after Phase 2 passes (migrations + build).

