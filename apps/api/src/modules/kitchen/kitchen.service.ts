import { BadRequestException, Injectable } from '@nestjs/common';

import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class KitchenService {
  constructor(private prisma: PrismaService) {}

  async getQueue(tenantId: string) {
    return this.prisma.customerOrder.findMany({
      where: {
        tenantId,

        status: {
          in: [OrderStatus.PAID, OrderStatus.IN_PROGRESS, OrderStatus.READY],
        },
      },

      include: {
        items: {
          include: {
            product: true,
          },
        },
      },

      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async startCooking(id: string, tenantId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Order must be PAID');
    }

    return this.prisma.customerOrder.update({
      where: {
        id,
      },

      data: {
        status: OrderStatus.IN_PROGRESS,
      },
    });
  }

  async ready(id: string, tenantId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Order must be IN_PROGRESS');
    }

    return this.prisma.customerOrder.update({
      where: {
        id,
      },

      data: {
        status: OrderStatus.READY,
      },
    });
  }

  async complete(id: string, tenantId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status !== OrderStatus.READY) {
      throw new BadRequestException('Order must be READY');
    }

    return this.prisma.customerOrder.update({
      where: {
        id,
      },

      data: {
        status: OrderStatus.COMPLETED,
      },
    });
  }
}
