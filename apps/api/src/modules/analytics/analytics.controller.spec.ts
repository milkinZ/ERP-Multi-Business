import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  const getSummary = jest.fn();
  const getTopProducts = jest.fn();
  const service = { getSummary, getTopProducts } as unknown as AnalyticsService;
  const user = { tenantId: 'tenant-a' } as never;
  let controller: AnalyticsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AnalyticsController(service);
  });

  it('passes authenticated tenant and query to analytics summary', async () => {
    getSummary.mockResolvedValue({ totalOrders: 0 });
    const query = { startDate: '2026-01-01' } as never;

    await controller.getSummary(user, query);

    expect(getSummary).toHaveBeenCalledWith('tenant-a', query);
  });

  it('passes authenticated tenant to top-products query', async () => {
    getTopProducts.mockResolvedValue({ items: [] });

    await controller.getTopProducts(user, undefined);

    expect(getTopProducts).toHaveBeenCalledWith('tenant-a', undefined);
  });
});
