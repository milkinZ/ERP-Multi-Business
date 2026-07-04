import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  DOMAIN_EVENTS,
  OrderCreatedEvent,
  OrderPaymentSuccessEvent,
  PurchaseOrderCreatedEvent,
  PurchaseOrderReceivedEvent,
  SalesOrderCompletedEvent,
} from '../../core/events/domain-events';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { NotificationService } from './notification.service';
import { NotificationType } from './notification.types';

@Injectable()
export class NotificationEventSubscriber implements OnModuleInit {
  private readonly logger = new Logger(NotificationEventSubscriber.name);

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe<OrderCreatedEvent>(
      DOMAIN_EVENTS.ORDER_CREATED,
      (event) => this.handleOrderCreated(event),
    );

    this.eventBus.subscribe<OrderPaymentSuccessEvent>(
      DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      (event) => this.handlePaymentSuccess(event),
    );

    this.eventBus.subscribe<SalesOrderCompletedEvent>(
      DOMAIN_EVENTS.SALES_ORDER_COMPLETED,
      (event) => this.handleOrderCompleted(event),
    );

    this.eventBus.subscribe<PurchaseOrderCreatedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_CREATED,
      (event) => this.handlePurchaseOrderCreated(event),
    );

    this.eventBus.subscribe<PurchaseOrderReceivedEvent>(
      DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED,
      (event) => this.handlePurchaseOrderReceived(event),
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent) {
    try {
      await this.notificationService.sendNotification({
        tenantId: event.payload.tenantId,
        userId: undefined,
        outletId: event.payload.outletId ?? undefined,
        type: NotificationType.ORDER_CREATED,
        data: {
          orderId: event.payload.orderId,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Failed to enqueue order created notification',
        String(error),
      );
    }
  }

  private async handlePaymentSuccess(event: OrderPaymentSuccessEvent) {
    try {
      await this.notificationService.sendNotification({
        tenantId: event.payload.tenantId,
        userId: undefined,
        type: NotificationType.PAYMENT_PAID,
        data: {
          orderId: event.payload.orderId,
          paymentId: event.payload.paymentId,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Failed to enqueue payment success notification',
        String(error),
      );
    }
  }

  private async handleOrderCompleted(event: SalesOrderCompletedEvent) {
    try {
      await this.notificationService.sendNotification({
        tenantId: event.payload.tenantId,
        userId: undefined,
        type: NotificationType.ORDER_COMPLETED,
        data: {
          orderId: event.payload.orderId,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Failed to enqueue order complete notification',
        String(error),
      );
    }
  }

  private async handlePurchaseOrderCreated(event: PurchaseOrderCreatedEvent) {
    try {
      await this.notificationService.sendNotification({
        tenantId: event.payload.tenantId,
        userId: undefined,
        type: NotificationType.PO_CREATED,
        data: {
          purchaseOrderId: event.payload.purchaseOrderId,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Failed to enqueue purchase order created notification',
        String(error),
      );
    }
  }

  private async handlePurchaseOrderReceived(event: PurchaseOrderReceivedEvent) {
    try {
      await this.notificationService.sendNotification({
        tenantId: event.payload.tenantId,
        userId: undefined,
        type: NotificationType.PO_RECEIVED,
        data: {
          purchaseOrderId: event.payload.purchaseOrderId,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Failed to enqueue purchase order received notification',
        String(error),
      );
    }
  }
}
