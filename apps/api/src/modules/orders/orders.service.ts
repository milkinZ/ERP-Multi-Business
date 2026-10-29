import { BadRequestException, Injectable } from '@nestjs/common';

import { OrdersRepository } from './orders.repository';
import { OrderMode, OrderStatus } from '@prisma/client';
import { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';
import { InventoryReservationService } from '../inventory/inventory-reservation.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly events: DomainEventBus,
    private readonly inventoryReservations: InventoryReservationService,
  ) {}

  async create(
    tenantId: string,
    outletId: string | null,
    items: {
      productId: string;
      quantity: number;
    }[],
    orderMode: OrderMode = OrderMode.REGULAR,
  ) {
    const productIds = items.map((item) => item.productId);

    const products = await this.ordersRepository.findProductsByIds(
      productIds,
      tenantId,
    );

    if (products.length !== items.length) {
      throw new BadRequestException('Some products not found');
    }

    let totalAmount = 0;

    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw new BadRequestException('Product not found');
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      return {
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
        subtotal,
      };
    });

    const order = await this.ordersRepository.createOrder(
      tenantId,
      outletId,
      `ORD-${Date.now()}`,
      totalAmount,
      orderItems,
      orderMode,
    );

    await this.events.publish({
      type: DOMAIN_EVENTS.ORDER_CREATED,
      payload: {
        orderId: order.id,
        tenantId,
        outletId,
      },
    });

    // Production-grade alias event
    await this.events.publish({
      type: DOMAIN_EVENTS.SALES_ORDER_CREATED,
      payload: {
        orderId: order.id,
        tenantId,
        outletId,
      },
    });

    return order;
  }

  findAll(user: JwtUser) {
    return this.ordersRepository.findAll(user.tenantId, user.outletId || null);
  }

  findOne(id: string, user: JwtUser) {
    return this.ordersRepository.findOne(
      id,
      user.tenantId,
      user.outletId || null,
    );
  }

  async updateStatus(id: string, user: JwtUser, status: OrderStatus) {
    if (status === OrderStatus.PAID) {
      throw new BadRequestException(
        'Use payment endpoint to mark order as paid',
      );
    }
    if (status === OrderStatus.CANCELLED) {
      return this.cancelOrder(id, user.tenantId, user.outletId || null);
    }

    throw new BadRequestException(
      'Order workflow status is managed by payment and kitchen actions',
    );
  }

  async releaseToKitchen(id: string, tenantId: string) {
    const updated = await this.ordersRepository.releaseToKitchen(id, tenantId);
    if (!updated) {
      throw new BadRequestException('Order not found');
    }
    return updated;
  }

  findOneByTenant(id: string, tenantId: string) {
    return this.ordersRepository.findOne(id, tenantId);
  }

  async markPaid(id: string, tenantId: string) {
    const aggregate = await this.ordersRepository.findOneAggregate(
      id,
      tenantId,
    );

    if (!aggregate) {
      throw new BadRequestException('Order not found');
    }

    aggregate.markPaid();

    const updated = await this.ordersRepository.markPaid(id, tenantId);

    if (!updated) {
      throw new BadRequestException('Order not found');
    }

    return updated;
  }

  async cancelOrder(id: string, tenantId: string, outletId?: string | null) {
    const aggregate = await this.ordersRepository.findOneAggregate(
      id,
      tenantId,
      outletId,
    );

    if (!aggregate) {
      return null;
    }

    try {
      aggregate.cancel();
    } catch {
      return this.ordersRepository.findOne(id, tenantId);
    }

    const updated = await this.ordersRepository.cancelOrder(
      id,
      tenantId,
      outletId,
      (tx) => this.inventoryReservations.releaseReservation(id, tenantId, tx),
    );

    if (!updated) {
      throw new BadRequestException('Order not found');
    }
    return updated;
  }

  async markCompleted(id: string, tenantId: string) {
    const aggregate = await this.ordersRepository.findOneAggregate(
      id,
      tenantId,
    );

    if (!aggregate) {
      throw new BadRequestException('Order not found');
    }

    aggregate.complete();

    const updated = await this.ordersRepository.markCompleted(id, tenantId);

    if (!updated) {
      throw new BadRequestException('Order not found');
    }

    return updated;
  }
}
