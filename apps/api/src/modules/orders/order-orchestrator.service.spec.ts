import { BusinessType } from '@prisma/client';

import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { InventoryReservationService } from '../inventory/inventory-reservation.service';
import { OrdersService } from './orders.service';
import { OrderOrchestratorService } from './order-orchestrator.service';

describe('OrderOrchestratorService', () => {
  it('releases a fully paid cafe order to the kitchen from the shared event bus', async () => {
    const events = new DomainEventBus();
    const inventoryReservations = {
      reserveStock: jest.fn().mockResolvedValue(undefined),
    };
    const fulfillment = {
      resolveTenantBusinessType: jest.fn().mockResolvedValue(BusinessType.CAFE),
    };
    const orders = {
      releaseToKitchen: jest.fn().mockResolvedValue(undefined),
    };
    const orchestrator = new OrderOrchestratorService(
      events,
      inventoryReservations as unknown as InventoryReservationService,
      fulfillment as unknown as FulfillmentService,
      orders as unknown as OrdersService,
    );
    orchestrator.onModuleInit();

    await events.publish({
      type: DOMAIN_EVENTS.ORDER_PAYMENT_SUCCESS,
      payload: {
        orderId: 'order-a',
        tenantId: 'tenant-a',
        paymentId: 'payment-a',
        isFullyPaid: true,
      },
    });

    expect(inventoryReservations.reserveStock).toHaveBeenCalledWith(
      'order-a',
      'tenant-a',
    );
    expect(orders.releaseToKitchen).toHaveBeenCalledWith('order-a', 'tenant-a');
  });
});
