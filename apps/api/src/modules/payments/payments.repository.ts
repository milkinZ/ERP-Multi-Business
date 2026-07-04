import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
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

    if (!payment) {
      throw new Error('Failed to create payment');
    }

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
