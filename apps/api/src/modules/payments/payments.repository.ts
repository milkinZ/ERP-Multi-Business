import { Injectable } from '@nestjs/common';
import {
  OrderMode,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { BaseRepository } from '../../core/database/repositories/base.repository';
import { PrismaService } from '../../core/database/prisma.service';

export type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: {
    SalesOrder: true;
  };
}>;

export type SalesOrderForPayment = Prisma.SalesOrderGetPayload<{
  include: {
    SalesOrderItem: true;
  };
}>;

@Injectable()
export class PaymentsRepository extends BaseRepository {
  constructor(protected readonly prisma: PrismaService) {
    super(prisma);
  }

  async findOrderForPayment(orderId: string, tenantId: string) {
    return this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { SalesOrderItem: true },
    }) as Promise<SalesOrderForPayment | null>;
  }

  async createPayment(
    orderId: string,
    tenantId: string,
    amount: number,
    method: PaymentMethod,
  ) {
    const payment = await this.prisma.$transaction(async (tx) => {
      const [order] = await tx.$queryRaw<
        Array<{
          id: string;
          totalAmount: number;
          paidAmount: number;
          orderMode: OrderMode;
          paymentStatus: PaymentStatus;
          status: OrderStatus;
        }>
      >`
        SELECT "id", "totalAmount", "paidAmount", "orderMode", "paymentStatus", "status"
        FROM "SalesOrder"
        WHERE "id" = ${orderId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;

      if (
        !order ||
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.PAID ||
        order.paymentStatus === PaymentStatus.PAID ||
        (order.status === OrderStatus.COMPLETED &&
          order.orderMode !== OrderMode.OPEN_BILL)
      ) {
        return null;
      }

      const outstandingAmount = order.totalAmount - order.paidAmount;
      const newPaidAmount = order.paidAmount + amount;
      if (
        amount <= 0 ||
        amount > outstandingAmount ||
        (order.orderMode === OrderMode.REGULAR && amount !== outstandingAmount)
      ) {
        return null;
      }

      const fullyPaid = newPaidAmount >= order.totalAmount;
      const updatedOrder = await tx.salesOrder.updateMany({
        where: {
          id: orderId,
          tenantId,
          paidAmount: order.paidAmount,
          paymentStatus: { not: PaymentStatus.PAID },
        },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: fullyPaid ? PaymentStatus.PAID : PaymentStatus.PENDING,
        },
      });

      if (updatedOrder.count !== 1) {
        return null;
      }

      const created = await tx.payment.create({
        data: {
          orderId,
          tenantId,
          amount,
          method,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      });

      return tx.payment.findUnique({
        where: { id: created.id },
        include: { SalesOrder: true },
      });
    });

    return payment;
  }

  async findAll(tenantId: string) {
    return this.prisma.payment.findMany({
      where: { tenantId },
      include: { SalesOrder: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<PaymentWithOrder[]>;
  }

  async findOne(id: string, tenantId: string) {
    return this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: { SalesOrder: true },
    }) as Promise<PaymentWithOrder | null>;
  }
}
