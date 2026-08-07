export const DOMAIN_EVENTS = {
  // Auth / User
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Product
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',

  // Orders / Sales
  // Legacy event names (existing behavior)
  ORDER_CREATED: 'order.created',
  ORDER_RESERVED: 'order.reserved',
  ORDER_RESERVATION_EXPIRED: 'order.reservation.expired',
  ORDER_PAYMENT_SUCCESS: 'order.payment.success',
  ORDER_PAYMENT_FAILED: 'order.payment.failed',
  ORDER_FULFILLMENT_STARTED: 'order.fulfillment.started',
  SALES_ORDER_COMPLETED: 'sales-order.completed',

  // Production-grade aliases (required API/event taxonomy)
  SALES_ORDER_CREATED: 'sales-order.created',
  SALES_ORDER_CONFIRMED: 'sales-order.confirmed',
  SALES_ORDER_PAID: 'sales-order.paid',
  SALES_ORDER_CANCELLED: 'sales-order.cancelled',
  SALES_ORDER_REFUNDED: 'sales-order.refunded',
  SALES_ORDER_COMPLETED_V2: 'sales-order.completed.v2',

  // Purchase Orders
  PURCHASE_ORDER_CREATED: 'purchase-order.created',

  // Lifecycle (production-grade)
  PURCHASE_ORDER_PENDING_APPROVAL: 'purchase-order.pending-approval',
  PURCHASE_ORDER_APPROVED: 'purchase-order.approved',
  PURCHASE_ORDER_REJECTED: 'purchase-order.rejected',
  PURCHASE_ORDER_SENT: 'purchase-order.sent',
  PURCHASE_ORDER_PARTIALLY_RECEIVED: 'purchase-order.partially-received',
  PURCHASE_ORDER_RECEIVED: 'purchase-order.received',
  PURCHASE_ORDER_COMPLETED: 'purchase-order.completed',
  PURCHASE_ORDER_CANCELLED: 'purchase-order.cancelled',

  // Inventory
  STOCK_ADJUSTED: 'stock.adjusted',

  // Kitchen events
  KITCHEN_COOKING_STARTED: 'kitchen.cooking.started',
  KITCHEN_READY: 'kitchen.ready',
  KITCHEN_SERVED: 'kitchen.served',
  KITCHEN_CANCELLED: 'kitchen.cancelled',
  KITCHEN_RECALLED: 'kitchen.recalled',

  // Feature Flags
  FEATURE_FLAG_CREATED: 'feature-flag.created',
  FEATURE_FLAG_ENABLED: 'feature-flag.enabled',
  FEATURE_FLAG_DISABLED: 'feature-flag.disabled',
  FEATURE_FLAG_UPDATED: 'feature-flag.updated',
  FEATURE_FLAG_ARCHIVED: 'feature-flag.archived',
  FEATURE_FLAG_RESTORED: 'feature-flag.restored',
  FEATURE_FLAG_OVERRIDE_CHANGED: 'feature-flag.override.changed',

  // Business Registry
  BUSINESS_CREATED: 'business.created',
  BUSINESS_UPDATED: 'business.updated',
  BUSINESS_ACTIVATED: 'business.activated',
  BUSINESS_SUSPENDED: 'business.suspended',
  BUSINESS_ARCHIVED: 'business.archived',
  BUSINESS_RESTORED: 'business.restored',
  BUSINESS_TYPE_CHANGED: 'business.type.changed',

  // Super Admin
  SUPER_ADMIN_TENANT_ACTIVATED: 'super-admin.tenant.activated',
  SUPER_ADMIN_TENANT_SUSPENDED: 'super-admin.tenant.suspended',
  SUPER_ADMIN_TENANT_DEACTIVATED: 'super-admin.tenant.deactivated',
  SUPER_ADMIN_TENANT_RESTORED: 'super-admin.tenant.restored',
  SUPER_ADMIN_PLAN_CHANGED: 'super-admin.plan.changed',
  SUPER_ADMIN_SUBSCRIPTION_CHANGED: 'super-admin.subscription.changed',

  // Subscription / Billing
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_EXPIRED: 'subscription.expired',
  SUBSCRIPTION_PLAN_CHANGED: 'subscription.plan.changed',
  SUBSCRIPTION_SUSPENDED: 'subscription.suspended',
  SUBSCRIPTION_PAST_DUE: 'subscription.past-due',
  PAYMENT_REQUIRED: 'billing.payment.required',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_FAILED: 'invoice.failed',
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

export type SalesOrderCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_CREATED,
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

export type SalesOrderPaidEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_PAID,
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

export type SalesOrderCancelledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_CANCELLED,
  {
    orderId: string;
    tenantId: string;
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

export type SalesOrderRefundedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_REFUNDED,
  {
    orderId: string;
    tenantId: string;
    reason?: string;
  }
>;

export type SalesOrderCompletedV2Event = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_COMPLETED_V2,
  {
    orderId: string;
    tenantId: string;
  }
>;

export type SalesOrderConfirmedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SALES_ORDER_CONFIRMED,
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

export type PurchaseOrderPendingApprovalEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_PENDING_APPROVAL,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type PurchaseOrderApprovedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type PurchaseOrderRejectedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_REJECTED,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
    reason?: string;
  }
>;

export type PurchaseOrderSentEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_SENT,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type PurchaseOrderPartiallyReceivedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED,
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

export type PurchaseOrderCompletedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_COMPLETED,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type PurchaseOrderCancelledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED,
  {
    purchaseOrderId: string;
    tenantId: string;
    outletId?: string | null;
    reason?: string;
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

// Kitchen events
export type KitchenCookingStartedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.KITCHEN_COOKING_STARTED,
  {
    ticketId: string;
    salesOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type KitchenReadyEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.KITCHEN_READY,
  {
    ticketId: string;
    salesOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type KitchenServedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.KITCHEN_SERVED,
  {
    ticketId: string;
    salesOrderId: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

export type KitchenCancelledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.KITCHEN_CANCELLED,
  {
    ticketId: string;
    salesOrderId: string;
    tenantId: string;
    outletId?: string | null;
    reason?: string;
  }
>;

export type KitchenRecalledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.KITCHEN_RECALLED,
  {
    ticketId: string;
    salesOrderId: string;
    tenantId: string;
    outletId?: string | null;
    reason?: string;
  }
>;

// Feature Flag Events
export type FeatureFlagCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_CREATED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
    enabled: boolean;
  }
>;

export type FeatureFlagEnabledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_ENABLED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
  }
>;

export type FeatureFlagDisabledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_DISABLED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
  }
>;

export type FeatureFlagUpdatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_UPDATED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
    changes: string[];
  }
>;

export type FeatureFlagArchivedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_ARCHIVED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
  }
>;

export type FeatureFlagRestoredEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_RESTORED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
  }
>;

export type FeatureFlagOverrideChangedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.FEATURE_FLAG_OVERRIDE_CHANGED,
  {
    featureFlagId: string;
    key: string;
    tenantId: string;
    outletId?: string | null;
  }
>;

// Business Registry Events
export type BusinessCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_CREATED,
  {
    tenantId: string;
    businessId: string;
    name: string;
    businessType: string;
  }
>;

export type BusinessUpdatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_UPDATED,
  {
    tenantId: string;
    businessId: string;
    changes: string[];
  }
>;

export type BusinessActivatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_ACTIVATED,
  {
    tenantId: string;
    businessId: string;
  }
>;

export type BusinessSuspendedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_SUSPENDED,
  {
    tenantId: string;
    businessId: string;
    reason?: string;
  }
>;

export type BusinessArchivedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_ARCHIVED,
  {
    tenantId: string;
    businessId: string;
  }
>;

export type BusinessRestoredEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_RESTORED,
  {
    tenantId: string;
    businessId: string;
  }
>;

export type BusinessTypeChangedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED,
  {
    tenantId: string;
    businessId: string;
    oldBusinessType: string;
    newBusinessType: string;
  }
>;

// Super Admin Events
export type SuperAdminTenantActivatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUPER_ADMIN_TENANT_ACTIVATED,
  {
    tenantId: string;
    targetTenantId: string;
    actionedByUserId: string;
  }
>;

export type SuperAdminTenantSuspendedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUPER_ADMIN_TENANT_SUSPENDED,
  {
    tenantId: string;
    targetTenantId: string;
    actionedByUserId: string;
    reason?: string;
  }
>;

export type SuperAdminTenantDeactivatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUPER_ADMIN_TENANT_DEACTIVATED,
  {
    tenantId: string;
    targetTenantId: string;
    actionedByUserId: string;
    reason?: string;
  }
>;

export type SuperAdminTenantRestoredEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUPER_ADMIN_TENANT_RESTORED,
  {
    tenantId: string;
    targetTenantId: string;
    actionedByUserId: string;
  }
>;

export type SuperAdminPlanChangedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUPER_ADMIN_PLAN_CHANGED,
  {
    tenantId: string;
    targetTenantId: string;
    oldPlanId: string;
    newPlanId: string;
    actionedByUserId: string;
  }
>;

export type SuperAdminSubscriptionChangedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUPER_ADMIN_SUBSCRIPTION_CHANGED,
  {
    tenantId: string;
    targetTenantId: string;
    subscriptionId: string;
    actionedByUserId: string;
    reason?: string;
  }
>;

// Subscription Events
export type SubscriptionCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_CREATED,
  {
    subscriptionId: string;
    tenantId: string;
    planType: string;
  }
>;

export type SubscriptionActivatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED,
  {
    subscriptionId: string;
    tenantId: string;
    planType: string;
  }
>;

export type SubscriptionRenewedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_RENEWED,
  {
    subscriptionId: string;
    tenantId: string;
    planType: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  }
>;

export type SubscriptionCancelledEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED,
  {
    subscriptionId: string;
    tenantId: string;
    reason?: string;
  }
>;

export type SubscriptionExpiredEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_EXPIRED,
  {
    subscriptionId: string;
    tenantId: string;
  }
>;

export type SubscriptionPlanChangedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
  {
    subscriptionId: string;
    tenantId: string;
    oldPlanType: string;
    newPlanType: string;
  }
>;

export type SubscriptionSuspendedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_SUSPENDED,
  {
    subscriptionId: string;
    tenantId: string;
    reason?: string;
  }
>;

export type SubscriptionPastDueEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
  {
    subscriptionId: string;
    tenantId: string;
    dueAmountCents: number;
  }
>;

export type PaymentRequiredEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.PAYMENT_REQUIRED,
  {
    subscriptionId: string;
    tenantId: string;
    amountCents: number;
    billingPeriod: string;
  }
>;

export type InvoiceCreatedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.INVOICE_CREATED,
  {
    invoiceId: string;
    invoiceNumber: string;
    tenantId: string;
    subscriptionId?: string;
    amountCents: number;
    currency: string;
  }
>;

export type InvoicePaidEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.INVOICE_PAID,
  {
    invoiceId: string;
    invoiceNumber: string;
    tenantId: string;
    subscriptionId?: string;
    amountCents: number;
  }
>;

export type InvoiceFailedEvent = BaseDomainEvent<
  typeof DOMAIN_EVENTS.INVOICE_FAILED,
  {
    invoiceId: string;
    invoiceNumber: string;
    tenantId: string;
    subscriptionId?: string;
    reason?: string;
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
  | SalesOrderCreatedEvent
  | SalesOrderConfirmedEvent
  | SalesOrderPaidEvent
  | SalesOrderCancelledEvent
  | SalesOrderCompletedEvent
  | SalesOrderCompletedV2Event
  | SalesOrderRefundedEvent
  | PurchaseOrderCreatedEvent
  | PurchaseOrderPendingApprovalEvent
  | PurchaseOrderApprovedEvent
  | PurchaseOrderRejectedEvent
  | PurchaseOrderSentEvent
  | PurchaseOrderPartiallyReceivedEvent
  | PurchaseOrderReceivedEvent
  | PurchaseOrderCompletedEvent
  | PurchaseOrderCancelledEvent
  | StockAdjustedEvent
  | KitchenCookingStartedEvent
  | KitchenReadyEvent
  | KitchenServedEvent
  | KitchenCancelledEvent
  | KitchenRecalledEvent
  | FeatureFlagCreatedEvent
  | FeatureFlagEnabledEvent
  | FeatureFlagDisabledEvent
  | FeatureFlagUpdatedEvent
  | FeatureFlagArchivedEvent
  | FeatureFlagRestoredEvent
  | FeatureFlagOverrideChangedEvent
  | BusinessCreatedEvent
  | BusinessUpdatedEvent
  | BusinessActivatedEvent
  | BusinessSuspendedEvent
  | BusinessArchivedEvent
  | BusinessRestoredEvent
  | BusinessTypeChangedEvent
  | SuperAdminTenantActivatedEvent
  | SuperAdminTenantSuspendedEvent
  | SuperAdminTenantDeactivatedEvent
  | SuperAdminTenantRestoredEvent
  | SuperAdminPlanChangedEvent
  | SuperAdminSubscriptionChangedEvent
  | SubscriptionCreatedEvent
  | SubscriptionActivatedEvent
  | SubscriptionRenewedEvent
  | SubscriptionCancelledEvent
  | SubscriptionExpiredEvent
  | SubscriptionPlanChangedEvent
  | SubscriptionSuspendedEvent
  | SubscriptionPastDueEvent
  | PaymentRequiredEvent
  | InvoiceCreatedEvent
  | InvoicePaidEvent
  | InvoiceFailedEvent;
