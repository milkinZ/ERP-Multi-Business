import { Injectable, OnModuleInit } from '@nestjs/common';

import {
  DOMAIN_EVENTS,
  OrderCreatedEvent,
  OrderPaymentFailedEvent,
  OrderPaymentSuccessEvent,
} from '../../core/events/domain-events';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { InventoryReservationService } from '../inventory/inventory-reservation.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderOrchestratorService implements OnModuleInit {
  constructor(
    private events: DomainEventBus,
    private inventoryReservations: InventoryReservationService,
    private fulfillmentService: FulfillmentService,
    private ordersService: OrdersService,
  ) {}

  onModuleInit() {
    this.events.subscribe<OrderCreatedEvent>(
      DOMAIN_EVENTS.ORDER_CREATED,
      (event) => this.handleOrderCreated(event),
    );

    this.events.subscribe<OrderPaymentSuccessEvent>(
      DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      (event) => this.handlePaymentSuccess(event),
    );

    this.events.subscribe<OrderPaymentFailedEvent>(
      DOMAIN_EVENTS.ORDER_PAYMENT_FAILED,
      (event) => this.handlePaymentFailed(event),
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent) {
    const { orderId, tenantId } = event.payload;

    try {
      await this.inventoryReservations.reserveStock(orderId, tenantId);

      await this.events.publish({
        type: DOMAIN_EVENTS.ORDER_RESERVED,
        payload: {
          orderId,
          tenantId,
        },
      });

      // Production-grade alias event
      await this.events.publish({
        type: DOMAIN_EVENTS.SALES_ORDER_CONFIRMED,
        payload: {
          orderId,
          tenantId,
        },
      });
    } catch (error) {
      await this.ordersService.cancelOrder(orderId, tenantId);

      throw error;
    }
  }

  private async handlePaymentSuccess(event: OrderPaymentSuccessEvent) {
    const { orderId, tenantId } = event.payload;

    await this.inventoryReservations.commitReservation(orderId, tenantId);

    await this.ordersService.markPaid(orderId, tenantId);

    const fulfillment = await this.fulfillmentService.processOrder(
      orderId,
      tenantId,
    );

    await this.events.publish({
      type: DOMAIN_EVENTS.ORDER_FULFILLMENT_STARTED,
      payload: {
        orderId,
        tenantId,
      },
    });

    if (fulfillment) {
      await this.ordersService.markCompleted(orderId, tenantId);

      await this.events.publish({
        type: DOMAIN_EVENTS.SALES_ORDER_COMPLETED,
        payload: {
          orderId,
          tenantId,
        },
      });

      // Production-grade alias event
      await this.events.publish({
        type: DOMAIN_EVENTS.SALES_ORDER_COMPLETED_V2,
        payload: {
          orderId,
          tenantId,
        },
      });
    }
  }

  private async handlePaymentFailed(event: OrderPaymentFailedEvent) {
    const { orderId, tenantId } = event.payload;

    await this.inventoryReservations.releaseReservation(orderId, tenantId);

    await this.ordersService.cancelOrder(orderId, tenantId);
  }
}
