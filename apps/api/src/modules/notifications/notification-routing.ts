import {
  DOMAIN_EVENTS,
  type DomainEvent,
} from '../../core/events/domain-events';
import { PERMISSIONS } from '../rbac/permissions';
import { NotificationCategory, NotificationType } from './notification.types';

export type NotificationRoute = {
  category: NotificationCategory;
  requiredPermission: string;
};

const routes = new Map<string, NotificationRoute>();

function register(
  eventTypes: readonly string[],
  category: NotificationCategory,
  requiredPermission: string,
) {
  for (const eventType of eventTypes) {
    routes.set(eventType, { category, requiredPermission });
  }
}

register(
  [
    DOMAIN_EVENTS.PRODUCT_CREATED,
    DOMAIN_EVENTS.PRODUCT_UPDATED,
    DOMAIN_EVENTS.PRODUCT_DELETED,
  ],
  NotificationCategory.PRODUCTS,
  PERMISSIONS.PRODUCT_READ,
);
register(
  [
    DOMAIN_EVENTS.ORDER_CREATED,
    DOMAIN_EVENTS.ORDER_RESERVED,
    DOMAIN_EVENTS.ORDER_RESERVATION_EXPIRED,
    DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED,
    DOMAIN_EVENTS.SALES_ORDER_CREATED,
    DOMAIN_EVENTS.SALES_ORDER_CONFIRMED,
    DOMAIN_EVENTS.SALES_ORDER_CANCELLED,
    DOMAIN_EVENTS.SALES_ORDER_COMPLETED,
    DOMAIN_EVENTS.SALES_ORDER_COMPLETED_V2,
    DOMAIN_EVENTS.SALES_ORDER_REFUNDED,
  ],
  NotificationCategory.ORDERS,
  PERMISSIONS.ORDER_READ,
);
register(
  [
    DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
    DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
    DOMAIN_EVENTS.SALES_ORDER_PAID,
  ],
  NotificationCategory.PAYMENTS,
  PERMISSIONS.PAYMENT_READ,
);
register(
  [DOMAIN_EVENTS.STOCK_ADJUSTED],
  NotificationCategory.INVENTORY,
  PERMISSIONS.INVENTORY_READ,
);
register(
  [
    DOMAIN_EVENTS.PURCHASE_ORDER_CREATED,
    DOMAIN_EVENTS.PURCHASE_ORDER_SENT,
    DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED,
    DOMAIN_EVENTS.PURCHASE_ORDER_RETURNED,
    DOMAIN_EVENTS.PURCHASE_ORDER_COMPLETED,
    DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED,
  ],
  NotificationCategory.PROCUREMENT,
  PERMISSIONS.PURCHASE_ORDER_READ,
);
register(
  [
    DOMAIN_EVENTS.PURCHASE_ORDER_PENDING_APPROVAL,
    DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED,
    DOMAIN_EVENTS.PURCHASE_ORDER_REJECTED,
  ],
  NotificationCategory.PROCUREMENT,
  PERMISSIONS.PURCHASE_ORDER_APPROVE,
);
register(
  [DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED],
  NotificationCategory.PROCUREMENT,
  PERMISSIONS.PURCHASE_ORDER_RECEIVE,
);
register(
  [
    DOMAIN_EVENTS.WAREHOUSE_TRANSFER_CREATED,
    DOMAIN_EVENTS.WAREHOUSE_TRANSFER_SHIPPED,
    DOMAIN_EVENTS.WAREHOUSE_TRANSFER_PARTIALLY_RECEIVED,
    DOMAIN_EVENTS.WAREHOUSE_TRANSFER_RECEIVED,
    DOMAIN_EVENTS.WAREHOUSE_TRANSFER_CANCELLED,
  ],
  NotificationCategory.INVENTORY,
  PERMISSIONS.WAREHOUSE_READ,
);
register(
  [
    DOMAIN_EVENTS.KITCHEN_COOKING_STARTED,
    DOMAIN_EVENTS.KITCHEN_READY,
    DOMAIN_EVENTS.KITCHEN_SERVED,
    DOMAIN_EVENTS.KITCHEN_CANCELLED,
    DOMAIN_EVENTS.KITCHEN_RECALLED,
    DOMAIN_EVENTS.KITCHEN_UPDATED,
  ],
  NotificationCategory.KITCHEN,
  PERMISSIONS.KITCHEN_READ,
);
register(
  [DOMAIN_EVENTS.USER_LOGIN, DOMAIN_EVENTS.USER_LOGOUT],
  NotificationCategory.USERS,
  PERMISSIONS.USER_READ,
);
register(
  [
    DOMAIN_EVENTS.FEATURE_FLAG_CREATED,
    DOMAIN_EVENTS.FEATURE_FLAG_ENABLED,
    DOMAIN_EVENTS.FEATURE_FLAG_DISABLED,
    DOMAIN_EVENTS.FEATURE_FLAG_UPDATED,
    DOMAIN_EVENTS.FEATURE_FLAG_ARCHIVED,
    DOMAIN_EVENTS.FEATURE_FLAG_RESTORED,
    DOMAIN_EVENTS.FEATURE_FLAG_OVERRIDE_CHANGED,
  ],
  NotificationCategory.FEATURE_FLAGS,
  PERMISSIONS.FEATURE_FLAG_READ,
);
register(
  [
    DOMAIN_EVENTS.BUSINESS_CREATED,
    DOMAIN_EVENTS.BUSINESS_UPDATED,
    DOMAIN_EVENTS.BUSINESS_ACTIVATED,
    DOMAIN_EVENTS.BUSINESS_SUSPENDED,
    DOMAIN_EVENTS.BUSINESS_ARCHIVED,
    DOMAIN_EVENTS.BUSINESS_RESTORED,
    DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED,
    DOMAIN_EVENTS.SUPER_ADMIN_TENANT_ACTIVATED,
    DOMAIN_EVENTS.SUPER_ADMIN_TENANT_SUSPENDED,
    DOMAIN_EVENTS.SUPER_ADMIN_TENANT_DEACTIVATED,
    DOMAIN_EVENTS.SUPER_ADMIN_TENANT_RESTORED,
  ],
  NotificationCategory.BUSINESS,
  PERMISSIONS.BUSINESS_READ,
);
register(
  [
    DOMAIN_EVENTS.SUPER_ADMIN_PLAN_CHANGE_SCHEDULED,
    DOMAIN_EVENTS.SUPER_ADMIN_SUBSCRIPTION_CHANGED,
    DOMAIN_EVENTS.SUBSCRIPTION_CREATED,
    DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED,
    DOMAIN_EVENTS.SUBSCRIPTION_RENEWED,
    DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED,
    DOMAIN_EVENTS.SUBSCRIPTION_EXPIRED,
    DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGED,
    DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGE_SCHEDULED,
    DOMAIN_EVENTS.SUBSCRIPTION_SUSPENDED,
    DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE,
  ],
  NotificationCategory.SUBSCRIPTIONS,
  PERMISSIONS.SUBSCRIPTION_READ,
);
register(
  [
    DOMAIN_EVENTS.PAYMENT_REQUIRED,
    DOMAIN_EVENTS.INVOICE_CREATED,
    DOMAIN_EVENTS.INVOICE_PAID,
    DOMAIN_EVENTS.INVOICE_FAILED,
    DOMAIN_EVENTS.INVOICE_CANCELLED,
    DOMAIN_EVENTS.INVOICE_REFUNDED,
  ],
  NotificationCategory.BILLING,
  PERMISSIONS.INVOICE_READ,
);

export function resolveNotificationRoute(
  event: DomainEvent,
): NotificationRoute | null {
  const route = routes.get(event.type);
  return route ?? null;
}

export function toDomainEventNotification(
  event: DomainEvent,
  category: NotificationCategory,
) {
  const eventName = event.type
    .split(/[.-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const payload = event.payload as Record<string, unknown>;
  const resourceId = [
    payload.orderId,
    payload.purchaseOrderId,
    payload.invoiceId,
    payload.productId,
    payload.transferId,
    payload.userId,
    payload.featureFlagId,
    payload.businessId,
  ].find((value): value is string => typeof value === 'string');

  return {
    type: NotificationType.DOMAIN_EVENT,
    category,
    title: eventName,
    message: resourceId
      ? `${eventName} for reference ${resourceId}.`
      : `${eventName} was recorded for this tenant.`,
    data: {
      eventType: event.type,
      ...(resourceId ? { resourceId } : {}),
    },
  };
}
