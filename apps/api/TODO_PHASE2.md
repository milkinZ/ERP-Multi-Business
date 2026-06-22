# Phase 2 TODO (Database Foundation)

## Completed
- [x] Applied `updatedAt` + `deletedAt` for `Tenant`
- [x] Applied `updatedAt` + `deletedAt` for `User`
- [x] Updated `Outlet` model with `updatedAt` + `deletedAt` in `schema.prisma`
- [x] Ran Prisma migrations; DB reports schema up to date

## Remaining (must complete to satisfy Phase 2 roadmap)
- [ ] Add missing required models to `schema.prisma` (next migration apply)

  - [ ] Session
  - [ ] AuditLog
  - [ ] Notification
  - [ ] FeatureFlag
  - [ ] Plan
  - [ ] Subscription
  - [ ] Invoice
- [ ] Add RBAC join tables per roadmap:
  - [ ] UserRole
  - [ ] UserOutlet
- [ ] Implement BaseEntity pattern consistently across core models (id/createdAt/updatedAt/deletedAt where required)
- [ ] Add soft-delete support (deletedAt + query filters approach)
- [ ] Generate and apply the next Prisma migration(s)
- [ ] Re-run `nest build` and `tsc --noEmit` and ensure no Prisma/type errors

