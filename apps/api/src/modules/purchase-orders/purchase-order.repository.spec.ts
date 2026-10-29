import { PurchaseOrderRepository } from './purchase-order.repository';

describe('PurchaseOrderRepository.findAll', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  let repository: PurchaseOrderRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repository = new PurchaseOrderRepository({
      purchaseOrder: { findMany, count },
    } as never);
  });

  it('applies tenant-scoped search, inclusive date range, sorting and pagination', async () => {
    const fromDate = new Date('2026-03-01T00:00:00.000Z');
    const toDate = new Date('2026-03-31T00:00:00.000Z');
    await repository.findAll('tenant-a', {
      supplierId: 'supplier-a',
      search: 'PO-100',
      fromDate,
      toDate,
      sortBy: 'totalAmount',
      sortOrder: 'asc',
      skip: 10,
      take: 5,
    });

    const where = {
      tenantId: 'tenant-a',
      supplierId: 'supplier-a',
      AND: [
        { Supplier: { is: { tenantId: 'tenant-a' } } },
        {
          OR: [
            { poNumber: { contains: 'PO-100', mode: 'insensitive' } },
            {
              Supplier: {
                is: {
                  tenantId: 'tenant-a',
                  OR: [
                    { name: { contains: 'PO-100', mode: 'insensitive' } },
                    { email: { contains: 'PO-100', mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        },
      ],
      createdAt: {
        gte: fromDate,
        lt: new Date('2026-04-01T00:00:00.000Z'),
      },
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      include: {
        PurchaseOrderItem: true,
        Supplier: true,
        Warehouse: true,
      },
      skip: 10,
      take: 5,
      orderBy: [{ totalAmount: 'asc' }, { id: 'asc' }],
    });
    expect(count).toHaveBeenCalledWith({ where });
  });
});
