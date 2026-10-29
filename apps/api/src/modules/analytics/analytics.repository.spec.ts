import { PrismaService } from '../../core/database/prisma.service';
import { AnalyticsRepository } from './analytics.repository';

describe('AnalyticsRepository', () => {
  const salesOrderFindMany = jest.fn();
  const salesOrderCount = jest.fn();
  const paymentAggregate = jest.fn();
  const paymentCount = jest.fn();
  const salesOrderItemGroupBy = jest.fn();
  const productFindMany = jest.fn();

  const repo = new AnalyticsRepository({
    salesOrder: {
      findMany: salesOrderFindMany,
      count: salesOrderCount,
    },
    payment: {
      aggregate: paymentAggregate,
      count: paymentCount,
    },
    salesOrderItem: {
      groupBy: salesOrderItemGroupBy,
    },
    product: {
      findMany: productFindMany,
      count: jest.fn(),
    },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hydrates outlet-scoped payment totals through order ids instead of nested relation filters', async () => {
    salesOrderFindMany.mockResolvedValue([
      { id: 'order-1' },
      { id: 'order-2' },
    ]);
    salesOrderCount.mockResolvedValue(4);
    paymentAggregate.mockResolvedValue({ _sum: { amount: 1500 }, _count: 2 });
    paymentCount.mockResolvedValue(3);

    const result = await repo.aggregateRevenue('tenant-1', {
      outletId: 'outlet-1',
    });

    expect(salesOrderFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        outletId: 'outlet-1',
        paymentStatus: 'PAID',
      },
      select: { id: true },
    });
    expect(paymentAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: 'PAID',
          orderId: { in: ['order-1', 'order-2'] },
        }) as unknown,
      }),
    );
    expect(result).toMatchObject({
      totalRevenue: 1500,
      paidOrderCount: 4,
      totalOrderCount: 4,
      totalPaymentCount: 3,
    });
  });

  it('groups top products using order ids from completed orders to avoid undefined salesOrder relation access', async () => {
    salesOrderFindMany.mockResolvedValue([
      { id: 'order-1' },
      { id: 'order-2' },
    ]);
    salesOrderItemGroupBy.mockResolvedValue([
      { productId: 'prod-1', _sum: { quantity: 6 } },
    ]);
    productFindMany.mockResolvedValue([{ id: 'prod-1', name: 'Espresso' }]);

    const result = await repo.getTopProducts(
      'tenant-1',
      { outletId: 'outlet-1' },
      10,
    );

    expect(salesOrderFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        status: 'COMPLETED',
        outletId: 'outlet-1',
      },
      select: { id: true },
    });
    expect(salesOrderItemGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: { in: ['order-1', 'order-2'] } },
      }),
    );
    expect(result).toEqual([
      { productId: 'prod-1', name: 'Espresso', qtySold: 6 },
    ]);
  });
});
