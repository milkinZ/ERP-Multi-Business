import { DomainEvent, DOMAIN_EVENTS } from '../../../core/events/domain-events';

// Domain event types for PO lifecycle.
export type PurchaseOrderPendingApprovalEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_PENDING_APPROVAL;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  };
};

export type PurchaseOrderApprovedEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  };
};

export type PurchaseOrderRejectedEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_REJECTED;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
    reason?: string;
  };
};

export type PurchaseOrderSentEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_SENT;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  };
};

export type PurchaseOrderPartiallyReceivedEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  };
};

export type PurchaseOrderReceivedEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  };
};

export type PurchaseOrderCompletedEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_COMPLETED;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  };
};

export type PurchaseOrderCancelledEvent = DomainEvent & {
  type: typeof DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED;
  payload: {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
    reason?: string;
  };
};
