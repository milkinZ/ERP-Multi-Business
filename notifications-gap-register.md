# Notifications gap register

## Backend contract audit

Verified backend contract in the repo:

- `GET /notifications` lists notifications for the authenticated user and tenant.
- `GET /notifications/unread/count` returns `{ unreadCount }` for the current user and tenant.
- `PUT /notifications/:id/read` marks a specific notification as read for the tenant scope.
- `PUT /notifications/read/all` marks all unread notifications in user + tenant scope as read.
- `DELETE /notifications/:id` soft deletes the notification by id and tenant.
- The controller is guarded by `JwtAuthGuard` only; there are no notification-specific RBAC permission decorators in the actual backend.
- The Prisma model stores `tenantId`, `outletId`, `userId`, `type`, `title`, `message`, `payload`, `readAt`, `deletedAt`, and timestamps.
- The notification list supports pagination via query params `page` and `limit`, but the controller response shape returns `data` + `pagination` and the frontend must treat pagination as a backend concern while the shared `apiRequest` helper unwraps only top-level `data`.

## Confirmed gaps

### BACKEND CONTRACT GAP
- No notification detail endpoint exists in the current controller.
- No notification preferences API exists in the current backend module.
- No typed notification enum is enforced at the database layer; the model uses `type: String`.
- No `notification.*` permission constants exist in the RBAC registry.

### FRONTEND GAP
- No notifications page existed before this implementation.
- No ERP navigation item existed for Notifications.
- No existing frontend query layer or UI existed for notification list/actions.

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
