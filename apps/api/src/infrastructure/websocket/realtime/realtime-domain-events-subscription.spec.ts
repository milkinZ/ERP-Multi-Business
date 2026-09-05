import { RealtimeDomainEventsSubscription } from './realtime-domain-events-subscription';

import { DOMAIN_EVENTS } from '../../../core/events/domain-events';

describe('RealtimeDomainEventsSubscription', () => {
  it('should subscribe to all meaningful domain events', () => {
    const subscribed: string[] = [];
    const bus = {
      subscribe: (eventName: string) => {
        subscribed.push(eventName);
        return () => undefined;
      },
    } as never;

    const onEvent = () => undefined;

    const subscription = new RealtimeDomainEventsSubscription({
      bus,
      onEvent,
    });

    subscription.subscribe();

    // Orders / Sales
    expect(subscribed).toContain(DOMAIN_EVENTS.ORDER_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_CONFIRMED);
    expect(subscribed).toContain(DOMAIN_EVENTS.ORDER_RESERVED);
    expect(subscribed).toContain(DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_PAID);
    expect(subscribed).toContain(DOMAIN_EVENTS.ORDER_PAYMENT_FAILED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_CANCELLED);
    expect(subscribed).toContain(DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_COMPLETED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_COMPLETED_V2);
    expect(subscribed).toContain(DOMAIN_EVENTS.SALES_ORDER_REFUNDED);

    // Purchase Orders
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_PENDING_APPROVAL);
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_REJECTED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_SENT);
    expect(subscribed).toContain(
      DOMAIN_EVENTS.PURCHASE_ORDER_PARTIALLY_RECEIVED,
    );
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_COMPLETED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED);

    // Inventory
    expect(subscribed).toContain(DOMAIN_EVENTS.STOCK_ADJUSTED);

    // Kitchen
    expect(subscribed).toContain(DOMAIN_EVENTS.KITCHEN_COOKING_STARTED);
    expect(subscribed).toContain(DOMAIN_EVENTS.KITCHEN_READY);
    expect(subscribed).toContain(DOMAIN_EVENTS.KITCHEN_SERVED);
    expect(subscribed).toContain(DOMAIN_EVENTS.KITCHEN_CANCELLED);
    expect(subscribed).toContain(DOMAIN_EVENTS.KITCHEN_RECALLED);

    // Products
    expect(subscribed).toContain(DOMAIN_EVENTS.PRODUCT_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PRODUCT_UPDATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.PRODUCT_DELETED);

    // Feature Flags
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_ENABLED);
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_DISABLED);
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_UPDATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_ARCHIVED);
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_RESTORED);
    expect(subscribed).toContain(DOMAIN_EVENTS.FEATURE_FLAG_OVERRIDE_CHANGED);

    // Business Registry
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_UPDATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_ACTIVATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_SUSPENDED);
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_ARCHIVED);
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_RESTORED);
    expect(subscribed).toContain(DOMAIN_EVENTS.BUSINESS_TYPE_CHANGED);

    // Subscription / Billing
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_ACTIVATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_RENEWED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_CANCELLED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_EXPIRED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_PLAN_CHANGED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_SUSPENDED);
    expect(subscribed).toContain(DOMAIN_EVENTS.SUBSCRIPTION_PAST_DUE);
    expect(subscribed).toContain(DOMAIN_EVENTS.PAYMENT_REQUIRED);
    expect(subscribed).toContain(DOMAIN_EVENTS.INVOICE_CREATED);
    expect(subscribed).toContain(DOMAIN_EVENTS.INVOICE_PAID);
    expect(subscribed).toContain(DOMAIN_EVENTS.INVOICE_FAILED);

    // Auth / User
    expect(subscribed).toContain(DOMAIN_EVENTS.USER_LOGIN);
    expect(subscribed).toContain(DOMAIN_EVENTS.USER_LOGOUT);
  });
});
