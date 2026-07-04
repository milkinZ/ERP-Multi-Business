export const DOMAIN_EVENTS = {
  // Auth / User
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Product
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',

  // Orders / Sales
  ORDER_CREATED: 'order.created',
  ORDER_RESERVED: 'order.reserved',
  ORDER_RESERVATION_EXPIRED: 'order.reservation.expired',
  ORDER_PAYMENT_SUCCESS: 'order.payment.success',
  ORDER_PAYMENT_FAILED: 'order.payment.failed',
  ORDER_FULFILLMENT_STARTED: 'order.fulfillment.started',
  SALES_ORDER_COMPLETED: 'sales-order.completed',

  // Purchase Orders
  PURCHASE_ORDER_CREATED: 'purchase-order.created',
  PURCHASE_ORDER_RECEIVED: 'purchase-order.received',

  // Inventory
  STOCK_ADJUSTED: 'stock.adjusted',
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

type BaseDomainEvent<
  TType extends DomainEventName,
  TPayload extends Record<string, unknown>,
> = {
  type: TType;
  payload: TPayload;
  occurredAt?: Date;
};

export type OrderCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.ORDER_CREATED,
  {
    orderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type OrderReservedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.ORDER_RESERVED,
  {
    orderId: string;
    tenantId: string;
  }
>;

export type OrderPaymentSuccessEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
  {
    orderId: string;
    tenantId: string;
    paymentId: string;
  }
>;

export type OrderPaymentFailedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
  {
    orderId: string;
    tenantId: string;
    paymentId?: string;
    reason?: string;
  }
>;

export type OrderFulfillmentStartedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED,
  {
    orderId: string;
    tenantId: string;
  }
>;

export type SalesOrderCompletedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_COMPLETED,
  {
    orderId: string;
    tenantId: string;
  }
>;

// Auth / User
export type UserLoginEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.USER_LOGIN,
  {
    userId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type UserLogoutEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.USER_LOGOUT,
  {
    userId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

// Product
export type ProductCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PRODUCT_CREATED,
  {
    productId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type ProductUpdatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PRODUCT_UPDATED,
  {
    productId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type ProductDeletedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PRODUCT_DELETED,
  {
    productId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

// Purchase Orders
export type PurchaseOrderCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_CREATED,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type PurchaseOrderReceivedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

// Inventory
export type StockAdjustedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.STOCK_ADJUSTED,
  {
    inventoryItemId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type DomainEvent =
  | UserLoginEvent
  | UserLogoutEvent
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductDeletedEvent
  | OrderCreatedEvent
  | OrderReservedEvent
  | OrderPaymentSuccessEvent
  | OrderPaymentFailedEvent
  | OrderFulfillmentStartedEvent
  | SalesOrderCompletedEvent
  | PurchaseOrderCreatedEvent
  | PurchaseOrderReceivedEvent
  | StockAdjustedEvent;
