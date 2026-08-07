import type { RealtimeEventRoomRouting } from './dto/realtime-event-payload.dto';

// This file ONLY defines routing from known payload shapes.
// No business logic, no Prisma, no side effects.

export type RealtimeDomainPayload = Record<string, unknown>;

/**
 * Extracts realtime room routing from a domain event payload.
 *
 * Routing is based exclusively on tenantId (required), outletId (optional),
 * and userId (optional). All domain event payloads carry a tenantId for
 * multi-tenant isolation. Entity identifiers (orderId, purchaseOrderId,
 * productId, inventoryItemId, ticketId, featureFlagId, businessId,
 * subscriptionId, invoiceId) are NOT routing dimensions — they are carried
 * in the payload DTO only.
 */
export const toRealtimeRoomRouting = (
  _eventType: string,
  payload: RealtimeDomainPayload,
): RealtimeEventRoomRouting => {
  // Tenant is required for isolation.
  const tenantId = (payload as { tenantId?: unknown }).tenantId;

  // outletId and userId are optional.
  const outletId = (payload as { outletId?: unknown }).outletId;
  const userId = (payload as { userId?: unknown }).userId;

  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    // If tenantId is missing or empty, return empty routing.
    // Caller will drop the emit. This guarantees events never leak
    // across tenants because no global room is ever used.
    return { tenantId: '' };
  }

  return {
    tenantId,
    outletId:
      typeof outletId === 'string' && outletId.length > 0 ? outletId : null,
    userId:
      typeof userId === 'string' && userId.length > 0 ? userId : undefined,
  };
};

/**
 * Builds the concrete Socket.IO room names for a routing.
 *
 * IMPORTANT: never broadcasts globally. Events are only delivered to
 * scoped tenant/outlet/user rooms.
 */
export const getRealtimeEventRooms = (routing: RealtimeEventRoomRouting) => {
  const rooms: string[] = [];
  if (!routing.tenantId) return rooms;

  rooms.push(`tenant:${routing.tenantId}`);

  if (routing.outletId) {
    rooms.push(`outlet:${routing.outletId}`);
  }

  if (routing.userId) {
    rooms.push(`user:${routing.userId}`);
  }

  return rooms;
};
