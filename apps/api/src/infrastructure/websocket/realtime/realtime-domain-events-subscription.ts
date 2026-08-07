import { DomainEventBus } from '../../../core/events/domain-event-bus.service';

import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

// Domain Events types are used only for typing subscription payloads.
// We do not execute business rules in this subscriber.
import type {
  DomainEvent,
  OrderCreatedEvent,
  SalesOrderCreatedEvent,
  SalesOrderConfirmedEvent,
  OrderReservedEvent,
  OrderPaymentSuccessEvent,
  SalesOrderPaidEvent,
  OrderPaymentFailedEvent,
  SalesOrderCancelledEvent,
  OrderFulfillmentStartedEvent,
  SalesOrderCompletedEvent,
  SalesOrderCompletedV2Event,
  SalesOrderRefundedEvent,
  PurchaseOrderCreatedEvent,
  PurchaseOrderPendingApprovalEvent,
  PurchaseOrderApprovedEvent,
  PurchaseOrderRejectedEvent,
  PurchaseOrderSentEvent,
  PurchaseOrderPartiallyReceivedEvent,
  PurchaseOrderReceivedEvent,
  PurchaseOrderCompletedEvent,
  PurchaseOrderCancelledEvent,
  StockAdjustedEvent,
  KitchenCookingStartedEvent,
  KitchenReadyEvent,
  KitchenServedEvent,
  KitchenCancelledEvent,
  KitchenRecalledEvent,
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductDeletedEvent,
  FeatureFlagCreatedEvent,
  FeatureFlagEnabledEvent,
  FeatureFlagDisabledEvent,
  FeatureFlagUpdatedEvent,
  FeatureFlagArchivedEvent,
  FeatureFlagRestoredEvent,
  FeatureFlagOverrideChangedEvent,
  BusinessCreatedEvent,
  BusinessUpdatedEvent,
  BusinessActivatedEvent,
  BusinessSuspendedEvent,
  BusinessArchivedEvent,
  BusinessRestoredEvent,
  BusinessTypeChangedEvent,
  SubscriptionCreatedEvent,
  SubscriptionActivatedEvent,
  SubscriptionRenewedEvent,
  SubscriptionCancelledEvent,
  SubscriptionExpiredEvent,
  SubscriptionPlanChangedEvent,
  SubscriptionSuspendedEvent,
  SubscriptionPastDueEvent,
  PaymentRequiredEvent,
  InvoiceCreatedEvent,
  InvoicePaidEvent,
  InvoiceFailedEvent,
  UserLoginEvent,
  UserLogoutEvent,
  SuperAdminTenantActivatedEvent,
  SuperAdminTenantSuspendedEvent,
  SuperAdminTenantDeactivatedEvent,
  SuperAdminTenantRestoredEvent,
  SuperAdminPlanChangedEvent,
  SuperAdminSubscriptionChangedEvent,
} from '../../../core/events/domain-events';

export type RealtimeEventSubscriberDeps = {
  bus: DomainEventBus;
  onEvent: (event: DomainEvent) => Promise<void> | void;
};

export class RealtimeDomainEventsSubscription {
  constructor(private readonly deps: RealtimeEventSubscriberDeps) {}

  subscribe() {
    // Subscribe to every domain event that is meaningful to realtime clients.
    // Each handler ONLY forwards the event to the onEvent callback (routing).
    // No business logic, no Prisma, no side effects live here.
    // Missing future events can be added incrementally without breaking contracts.

    // ---- Auth / User ----
    this.deps.bus.subscribe<UserLoginEvent>(DOMAIN_EVENTS.USER_LOGIN, (e) =>
      this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<UserLogoutEvent>(DOMAIN_EVENTS.USER_LOGOUT, (e) =>
      this.deps.onEvent(e),
    );

    // ---- Products ----
    this.deps.bus.subscribe<ProductCreatedEvent>(
      DOMAIN_EVENTS.PRODUCT_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<ProductUpdatedEvent>(
      DOMAIN_EVENTS.PRODUCT_UPDATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<ProductDeletedEvent>(
      DOMAIN_EVENTS.PRODUCT_DELETED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Orders / Sales (legacy + production taxonomy) ----
    this.deps.bus.subscribe<OrderCreatedEvent>(
      DOMAIN_EVENTS.ORDER_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderCreatedEvent>(
      DOMAIN_EVENTS.SALES_ORDER_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderConfirmedEvent>(
      DOMAIN_EVENTS.SALES_ORDER_CONFIRMED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<OrderReservedEvent>(
      DOMAIN_EVENTS.ORDER_RESERVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<OrderPaymentSuccessEvent>(
      DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderPaidEvent>(
      DOMAIN_EVENTS.SALES_ORDER_PAID,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<OrderPaymentFailedEvent>(
      DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderCancelledEvent>(
      DOMAIN_EVENTS.SALES_ORDER_CANCELLED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<OrderFulfillmentStartedEvent>(
      DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderCompletedEvent>(
      DOMAIN_EVENTS.SALES_ORDER_COMPLETED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderCompletedV2Event>(
      DOMAIN_EVENTS.SALES_ORDER_COMPLETED_V2,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SalesOrderRefundedEvent>(
      DOMAIN_EVENTS.SALES_ORDER_REFUNDED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Purchase Orders ----
    this.deps.bus.subscribe<PurchaseOrderCreatedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderPendingApprovalEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_PENDING_APPROVAL,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderApprovedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderRejectedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_REJECTED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderSentEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_SENT,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderPartiallyReceivedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderReceivedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderCompletedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_COMPLETED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PurchaseOrderCancelledEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Inventory ----
    this.deps.bus.subscribe<StockAdjustedEvent>(
      DOMAIN_EVENTS.STOCK_ADJUSTED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Kitchen ----
    this.deps.bus.subscribe<KitchenCookingStartedEvent>(
      DOMAIN_EVENTS.KITCHEN_COOKING_STARTED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<KitchenReadyEvent>(
      DOMAIN_EVENTS.KITCHEN_READY,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<KitchenServedEvent>(
      DOMAIN_EVENTS.KITCHEN_SERVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<KitchenCancelledEvent>(
      DOMAIN_EVENTS.KITCHEN_CANCELLED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<KitchenRecalledEvent>(
      DOMAIN_EVENTS.KITCHEN_RECALLED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Feature Flags ----
    this.deps.bus.subscribe<FeatureFlagCreatedEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<FeatureFlagEnabledEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_ENABLED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<FeatureFlagDisabledEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_DISABLED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<FeatureFlagUpdatedEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_UPDATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<FeatureFlagArchivedEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_ARCHIVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<FeatureFlagRestoredEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_RESTORED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<FeatureFlagOverrideChangedEvent>(
      DOMAIN_EVENTS.FEATURE_FLAG_OVERRIDE_CHANGED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Business Registry ----
    this.deps.bus.subscribe<BusinessCreatedEvent>(
      DOMAIN_EVENTS.BUSINESS_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<BusinessUpdatedEvent>(
      DOMAIN_EVENTS.BUSINESS_UPDATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<BusinessActivatedEvent>(
      DOMAIN_EVENTS.BUSINESS_ACTIVATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<BusinessSuspendedEvent>(
      DOMAIN_EVENTS.BUSINESS_SUSPENDED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<BusinessArchivedEvent>(
      DOMAIN_EVENTS.BUSINESS_ARCHIVED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<BusinessRestoredEvent>(
      DOMAIN_EVENTS.BUSINESS_RESTORED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<BusinessTypeChangedEvent>(
      DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Subscription / Billing ----
    this.deps.bus.subscribe<SubscriptionCreatedEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionActivatedEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionRenewedEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_RENEWED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionCancelledEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionExpiredEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_EXPIRED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionPlanChangedEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionSuspendedEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_SUSPENDED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SubscriptionPastDueEvent>(
      DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<PaymentRequiredEvent>(
      DOMAIN_EVENTS.PAYMENT_REQUIRED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<InvoiceCreatedEvent>(
      DOMAIN_EVENTS.INVOICE_CREATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<InvoicePaidEvent>(DOMAIN_EVENTS.INVOICE_PAID, (e) =>
      this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<InvoiceFailedEvent>(
      DOMAIN_EVENTS.INVOICE_FAILED,
      (e) => this.deps.onEvent(e),
    );

    // ---- Super Admin ----
    this.deps.bus.subscribe<SuperAdminTenantActivatedEvent>(
      DOMAIN_EVENTS.SUPER_ADMIN_TENANT_ACTIVATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SuperAdminTenantSuspendedEvent>(
      DOMAIN_EVENTS.SUPER_ADMIN_TENANT_SUSPENDED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SuperAdminTenantDeactivatedEvent>(
      DOMAIN_EVENTS.SUPER_ADMIN_TENANT_DEACTIVATED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SuperAdminTenantRestoredEvent>(
      DOMAIN_EVENTS.SUPER_ADMIN_TENANT_RESTORED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SuperAdminPlanChangedEvent>(
      DOMAIN_EVENTS.SUPER_ADMIN_PLAN_CHANGED,
      (e) => this.deps.onEvent(e),
    );
    this.deps.bus.subscribe<SuperAdminSubscriptionChangedEvent>(
      DOMAIN_EVENTS.SUPER_ADMIN_SUBSCRIPTION_CHANGED,
      (e) => this.deps.onEvent(e),
    );
  }
}
