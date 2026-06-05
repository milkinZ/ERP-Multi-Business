export const DOMAIN_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_RESERVED: 'order.reserved',
  ORDER_PAYMENT_SUCCESS: 'order.payment.success',
  ORDER_PAYMENT_FAILED: 'order.payment.failed',
  ORDER_FULFILLMENT_STARTED: 'order.fulfillment.started',
  ORDER_COMPLETED: 'order.completed',
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

export type OrderCompletedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.ORDER_COMPLETED,
  {
    orderId: string;
    tenantId: string;
  }
>;

export type DomainEvent =
  | OrderCreatedEvent
  | OrderReservedEvent
  | OrderPaymentSuccessEvent
  | OrderPaymentFailedEvent
  | OrderFulfillmentStartedEvent
  | OrderCompletedEvent;
