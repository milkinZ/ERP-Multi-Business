import { Injectable, OnModuleInit } from '@nestjs/common';

import {
  DOMAIN_EVENTS,
  OrderCreatedEvent,
  OrderPaymentFailedEvent,
  OrderPaymentSuccessEvent,
} from '../../core/events/domain-events';
import { BusinessType, OrderMode } from '@prisma/client';
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
    const order = await this.ordersService.findOneByTenant(orderId, tenantId);
    if (!order || order.orderMode !== OrderMode.OPEN_BILL) {
      return;
    }

    try {
      await this.inventoryReservations.reserveStock(orderId, tenantId);

      if (
        (await this.fulfillmentService.resolveTenantBusinessType(tenantId)) ===
        BusinessType.CAFE
      ) {
        await this.ordersService.releaseToKitchen(orderId, tenantId);
      }

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

    if (event.payload.isFullyPaid === false) {
      return;
    }

    const businessType =
      await this.fulfillmentService.resolveTenantBusinessType(tenantId);

    if (businessType === BusinessType.CAFE) {
      await this.inventoryReservations.reserveStock(orderId, tenantId);
      await this.ordersService.releaseToKitchen(orderId, tenantId);
      return;
    }

    if (businessType !== BusinessType.RETAIL) {
      return;
    }

    await this.inventoryReservations.reserveStock(orderId, tenantId);
    await this.inventoryReservations.commitReservation(orderId, tenantId);

    const order = await this.ordersService.findOneByTenant(orderId, tenantId);
    if (order?.status !== 'COMPLETED') {
      await this.ordersService.markPaid(orderId, tenantId);
    }

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
    const order = await this.ordersService.findOneByTenant(orderId, tenantId);

    if (order?.orderMode === OrderMode.OPEN_BILL) {
      return;
    }

    await this.ordersService.cancelOrder(orderId, tenantId);
  }
}
