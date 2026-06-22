import { BadRequestException, Injectable } from '@nestjs/common';

import { OrderStatus, PaymentStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

import { CreatePaymentDto } from './dto/create-payment.dto';
import { FulfillmentService } from '../fulfillment/fulfillment.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private fulfillmentService: FulfillmentService,
  ) {}

  async pay(tenantId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.salesOrder.findFirst({
      where: {
        id: dto.orderId,
        tenantId,
      },

      include: {
        SalesOrderItem: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('Order already paid');
    }

    if (dto.amount < order.totalAmount) {
      throw new BadRequestException('Insufficient payment amount');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,

          orderId: order.id,

          method: dto.method,

          amount: dto.amount,

          status: PaymentStatus.PAID,

          paidAt: new Date(),
        },
      });

      await tx.salesOrder.update({
        where: {
          id: order.id,
        },

        data: {
          status: OrderStatus.PAID,
        },
      });

      return payment;
    });

    await this.fulfillmentService.processOrder(order.id, tenantId);

    return payment;
  }

  async findAll(tenantId: string) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
      },

      include: {
        SalesOrder: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id,
        tenantId,
      },

      include: {
        SalesOrder: true,
      },
    });

    if (!payment) {
      throw new BadRequestException('Payment not found');
    }

    return payment;
  }
}
