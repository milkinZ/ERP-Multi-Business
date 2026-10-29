# Users Gap Register

## Implemented Contract

- `GET /users` and `GET /users/:id` are tenant-scoped to the authenticated user and require `user.read`.
- `GET /users` supports bounded pagination, case-insensitive email search, active/inactive status filtering, and sorting by email or timestamps.
- Safe user responses include `id`, `email`, `isActive`, role/outlet summaries, and timestamps. Passwords, invitation tokens, refresh tokens, and session details are excluded.
- `POST /users/invitations` accepts `{ email, roleIds, outletIds? }` and requires `rbac.user.role.manage`. It sends a one-time setup link; token hashes, not raw tokens, are persisted. Links expire after seven days.
- When invitation outlet assignments are requested, the actor must also have `rbac.user.outlet.manage`; target roles and outlets must belong to the authenticated tenant.
- `GET /users/invitations` lists paginated pending invitations; `DELETE /users/invitations/:id` revokes a pending invitation.
- `POST /auth/invitations/accept` accepts `{ token, password }`, activates the invited account, creates the assigned roles/outlets, and atomically claims the one-time token. Passwords require at least 12 characters and are limited to bcrypt's 72-byte input.
- Public `POST /auth/register` is disabled and responds with `410 Gone`.
- `PATCH /users/:id/status` accepts `{ isActive }` and requires `rbac.user.role.manage`. Deactivation revokes refresh tokens and tenant sessions. Self-deactivation and removing the last active user administrator are rejected.
- `GET/PUT /users/:id/roles` require `rbac.user.role.manage`; `GET/PUT /users/:id/outlets` require `rbac.user.outlet.manage`. Assignment updates validate tenant ownership and are transactional.

## Frontend

- `/app/users` supports search, active-status filters, pagination, invitations, pending-invitation revocation, and account activation/deactivation.
- `/app/users/:id` supports role and outlet assignment with independent permission gates.
- `/register?token=...` is the invitation password-setup page; missing, expired, revoked, or already-used tokens are rejected by the API.

## Security and Failure Handling

- Invitation delivery failures revoke the newly-created invitation and return an explicit error. The invitation token is only delivered in the setup link and is never returned by list/create APIs.
- Tenant ownership derives from the authenticated request; submitted tenant IDs are not accepted.
- System role policy and effective permissions constrain roles an actor may assign.
- User deactivation preserves the account record for reactivation while invalidating sessions.

## Verification Evidence (Local/Development)

- Migration `20261026000000_user_role_outlet_management` was applied to local `cafe_os` at `127.0.0.1:5432`; Prisma reports all 63 migrations applied. Existing local refresh tokens and sessions were revoked by design.
- To unblock local testing, the user explicitly approved assigning the system Owner role to an existing active account in local `cafe_os`. The assignment is verified with all 78 Owner permissions; existing roles and password were preserved.
- The API now uses `WEB_BASE_URL=http://localhost:3001` in the local `.env`, matching the running web app. Mailpit at `127.0.0.1:8025` received the real invitation; the emailed link targeted port `3001`.
- The full API bootstrap responds at `127.0.0.1:9867`: health and CSRF return `200`, public registration returns `410`, invalid invitation tokens return `400`, and a reused accepted token returns `401`.
- Live invitation flow passed: API delivery returned `201`, setup activated the account with assigned Staff role and Outlet Malang, and token reuse was rejected. The acceptance flow initially exposed `TENANT_CONTEXT_MISSING`; request context now remains tenant-scoped through the transaction and the regression test passes.
- Live account lifecycle passed: role assignment and account deactivation returned `200`; deactivation left zero active sessions and refresh tokens, and subsequent login returned `401`.
- The web app is running on port `3001`; the setup page and authenticated user-management pages rendered in the browser. The invitation API test account is left inactive.
- Invitation service tests pass (4/4), API build passes, repository lint and type-check pass. Root build tasks reported success for API, web, and worker; the Turbo wrapper remained running after reporting completion and was stopped.
- Local/development verification is complete. This does not claim production deployment or production identity/configuration readiness.
