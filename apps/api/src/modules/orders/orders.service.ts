import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { OrderStatus } from '@prisma/client';
import { JwtUser } from '../../common/interfaces/jwt-user.interface';
import { buildOutletFilter } from '../../common/filter/outlet-filter';
import { DomainEventBus } from '../../core/events/domain-event-bus.service';
import { DOMAIN_EVENTS } from '../../core/events/domain-events';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private events: DomainEventBus,
  ) {}

  async create(
    tenantId: string,
    outletId: string | null,
    items: {
      productId: string;
      quantity: number;
    }[],
  ) {
    const order = await this.prisma.$transaction(async (tx) => {
      // ambil semua product
      const productIds = items.map((item) => item.productId);

      const products = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
          tenantId,
        },
      });
      // validasi product
      if (products.length !== items.length) {
        throw new BadRequestException('Some products not found');
      }

      // hitung total
      let totalAmount = 0;

      const orderItemsData = items.map((item) => {
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

      // create order
      const order = await tx.customerOrder.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          tenantId,
          outletId,
          totalAmount,
        },
      });
      // create order items
      await tx.customerOrderItem.createMany({
        data: orderItemsData.map((item) => ({
          ...item,
          orderId: order.id,
        })),
      });

      // return full order
      return tx.customerOrder.findUnique({
        where: {
          id: order.id,
        },

        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    await this.events.publish({
      type: DOMAIN_EVENTS.ORDER_CREATED,
      payload: {
        orderId: order.id,
        tenantId,
        outletId,
      },
    });

    return order;
  }

  findAll(user: JwtUser) {
    return this.prisma.customerOrder.findMany({
      where: {
        tenantId: user.tenantId,
        ...buildOutletFilter(user),
      },

      include: {
        items: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  findOne(id: string, user: JwtUser) {
    return this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        ...buildOutletFilter(user),
      },

      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async updateStatus(id: string, user: JwtUser, status: OrderStatus) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.findFirst({
        where: {
          id,
          tenantId: user.tenantId,
          ...buildOutletFilter(user),
        },

        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (!order) {
        throw new BadRequestException('Order not found');
      }

      if (status === OrderStatus.PAID) {
        throw new BadRequestException(
          'Use payment endpoint to mark order as paid',
        );
      }

      return tx.customerOrder.update({
        where: {
          id,
        },

        data: {
          status,
        },
      });
    });
  }

  async markPaid(id: string, tenantId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay cancelled order');
    }

    const updated = await this.prisma.customerOrder.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        status: OrderStatus.PAID,
      },
    });

    if (updated.count !== 1) {
      throw new BadRequestException('Order not found');
    }

    return this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  }

  async cancelOrder(id: string, tenantId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!order) {
      return null;
    }

    if (
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED
    ) {
      return order;
    }

    const updated = await this.prisma.customerOrder.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    if (updated.count !== 1) {
      throw new BadRequestException('Order not found');
    }

    return this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  }

  async markCompleted(id: string, tenantId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const updated = await this.prisma.customerOrder.updateMany({
      where: {
        id,
        tenantId,
      },
      data: {
        status: OrderStatus.COMPLETED,
      },
    });

    if (updated.count !== 1) {
      throw new BadRequestException('Order not found');
    }

    return this.prisma.customerOrder.findFirst({
      where: {
        id,
        tenantId,
      },
    });
  }
}
