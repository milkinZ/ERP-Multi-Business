# Notifications gap register

## Backend contract audit

Verified backend contract in the repo:

- `GET /notifications` lists notifications for the authenticated user and tenant.
- `GET /notifications/unread/count` returns `{ unreadCount }` for the current user and tenant.
- `PUT /notifications/:id/read` marks a specific notification as read for its authenticated owner and tenant.
- `PUT /notifications/read/all` marks all unread notifications in user + tenant scope as read.
- `DELETE /notifications/:id` soft deletes the notification for its authenticated owner and tenant.
- The controller is guarded by `JwtAuthGuard` only; there are no notification-specific RBAC permission decorators in the actual backend.
- List, unread-count, read, and delete queries are scoped to the authenticated user and tenant. Read/delete also require the record to be non-deleted.
- The Prisma model stores `tenantId`, `outletId`, `userId`, `type`, `title`, `message`, `payload`, `readAt`, `deletedAt`, and timestamps.
- The notification list supports pagination via query params `page` and `limit`, but the controller response shape returns `data` + `pagination` and the frontend must treat pagination as a backend concern while the shared `apiRequest` helper unwraps only top-level `data`.

## Confirmed gaps

### SECURITY GAP

- `PUT /notifications/:id/read` and `DELETE /notifications/:id` include the authenticated `userId`, tenant, and non-deleted predicate in their mutation filters. Cross-user attempts do not change the other user's record; tenant-isolation E2E coverage verifies this.
- Notification routes rely on authentication only; no notification-specific permission codes or policy exist.

### BACKEND CONTRACT GAP
- No notification detail endpoint exists in the current controller.
- No notification preferences API exists in the current backend module.
- No typed notification enum is enforced at the database layer; the model uses `type: String`.
- No `notification.*` permission constants exist in the RBAC registry.

### FRONTEND GAP
- The `/app/notifications` page, ERP navigation item, query layer, and list/read/delete actions are implemented against the verified endpoints.
- Pagination metadata is not surfaced as list navigation controls; the UI currently consumes the returned notification data only.
- No detail or preference-management UI exists because those backend contracts are absent.

### REALTIME GAP
- No WebSocket gateway or notification event stream is present in the backend code searched in this repo.
- Shared frontend realtime infrastructure is not present for notification delivery.

### ARCHITECTURE GAP
- Notification payload metadata is opaque JSON and cannot be trusted as authorization or navigation input.
- The backend does not expose a typed notification source model or a typed navigation contract.

## Implementation notes

- Frontend list and actions are implemented only against the verified backend routes.
- Metadata is handled as opaque data and not used for navigation or authorization.
- The UI avoids inventing unread counts, notification types, preferences, or realtime behavior not present in the actual backend contract.
