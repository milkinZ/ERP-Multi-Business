# Roles & Permissions Gap Register

## Implemented Contract

- `GET /roles` provides tenant-scoped bounded pagination, search, sorting, role descriptions, system-role metadata, assigned-user counts, and permission counts.
- `GET /roles/:id`, `POST /roles`, `PUT /roles/:id`, and `DELETE /roles/:id` require their corresponding `rbac.role.*` permissions.
- `GET /permissions` and `GET/PUT /roles/:id/permissions` expose the tenant permission catalog and role permission assignment.
- System roles are provisioned idempotently per tenant:
  - **Owner** receives the allowlisted tenant permissions, including user and role administration.
  - **Manager** receives operational management permissions without user or role administration.
  - **Staff** receives basic product, order, payment, kitchen, and outlet access.
- System roles cannot be edited or deleted. Tenant permission codes are fail-closed allowlisted; actors cannot grant or assign permissions they do not themselves possess.
- Roles with active user assignments or outstanding invitations cannot be deleted.
- `PUT /users/:id/roles` requires `rbac.user.role.manage`; it validates tenant ownership, deduplicates IDs, preserves the single-active-administrator invariant, and replaces assignments transactionally.
- Role and user assignment UI is available in `/app/roles` and `/app/users/:id`, gated by backend permissions.

## Security and Compatibility

- Role permission replacement is transactional and rejects platform-only, unknown, and unclassified permission codes.
- Default system role creation occurs when the role list is requested. Existing tenant-created roles are not overwritten.
- A user must retain at least one role; the last active user administrator cannot be removed through role assignment or account deactivation.

## Verification Evidence (Local/Development)

- Migration `20261026000000_user_role_outlet_management` is applied to local `cafe_os`; Prisma reports all 63 migrations applied.
- The local tenant's system Owner role was provisioned with all 78 tenant permissions after explicit user approval; no prior role or password was changed.
- Authenticated user-role assignment was exercised through the UI/API: the test account changed from Staff to Manager and back to Staff, with both `PUT /users/:id/roles` calls returning `200`.
- Invitation acceptance created an active Staff account with the requested role and outlet assignment; the test account was later deactivated and left inactive.
- Invitation service tests pass (4/4), API build passes, repository lint and type-check pass. Root build tasks reported success for API, web, and worker; the Turbo wrapper remained running after reporting completion and was stopped.
- Local/development role and permission verification is complete. Production rollout remains outside this local result.
