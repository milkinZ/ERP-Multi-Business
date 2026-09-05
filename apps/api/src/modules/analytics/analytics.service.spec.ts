import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const aggregateRevenue = jest.fn();
  const getProductCount = jest.fn();
  const getTopProducts = jest.fn();
  const repository = {
    aggregateRevenue,
    getProductCount,
    getTopProducts,
  } as unknown as AnalyticsRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsService(repository);
  });

  it('maps tenant-scoped aggregate results into the summary contract', async () => {
    aggregateRevenue.mockResolvedValue({
      totalOrderCount: 4,
      paidOrderCount: 3,
      completedOrderCount: 2,
      cancelledOrderCount: 1,
      totalPaymentCount: 3,
      totalRevenue: 1500,
      averageOrderValue: 375,
      pendingOrderCount: 0,
    });
    getProductCount.mockResolvedValue(8);
    const query = { from: '2026-01-01', to: '2026-01-31' } as never;

    await expect(service.getSummary('tenant-a', query)).resolves.toEqual({
      totalProducts: 8,
      totalOrders: 4,
      paidOrders: 3,
      completedOrders: 2,
      cancelledOrders: 1,
      totalPayments: 3,
      totalRevenue: 1500,
      averageOrderValue: 375,
      pendingOrders: 0,
    });
    expect(aggregateRevenue).toHaveBeenCalledWith('tenant-a', query);
    expect(getProductCount).toHaveBeenCalledWith('tenant-a', query);
  });

  it('returns empty top-product results and preserves repository failures', async () => {
    getTopProducts.mockResolvedValue([]);
    await expect(
      service.getTopProducts('tenant-a', undefined, 5),
    ).resolves.toEqual({
      items: [],
    });
    expect(getTopProducts).toHaveBeenCalledWith('tenant-a', undefined, 5);

    aggregateRevenue.mockRejectedValue(new Error('database unavailable'));
    await expect(service.getSummary('tenant-a')).rejects.toThrow(
      'database unavailable',
    );
  });
});
