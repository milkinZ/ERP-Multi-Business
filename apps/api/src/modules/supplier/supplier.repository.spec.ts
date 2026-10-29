import { Prisma } from '@prisma/client';

import { SupplierRepository } from './supplier.repository';

describe('SupplierRepository list contract', () => {
  const findMany = jest.fn<
    Promise<Array<{ id: string }>>,
    [Prisma.SupplierFindManyArgs]
  >();
  const count = jest.fn<Promise<number>, [Prisma.SupplierCountArgs]>();
  const transaction = jest.fn();
  const prisma = {
    supplier: { findMany, count },
    $transaction: transaction,
  } as never;
  let repository: SupplierRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([{ id: 'supplier-a' }]);
    count.mockResolvedValue(21);
    repository = new SupplierRepository(prisma);
  });

  it('applies tenant-safe search, status, stable sorting, and pagination', async () => {
    await expect(
      repository.findAll('tenant-a', {
        page: 2,
        limit: 10,
        search: 'acme',
        isActive: false,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    ).resolves.toEqual({
      data: [{ id: 'supplier-a' }],
      pagination: { page: 2, limit: 10, total: 21, totalPages: 3 },
    });

    const findManyArgs = findMany.mock.calls[0]?.[0];
    const countArgs = count.mock.calls[0]?.[0];
    expect(findManyArgs).toMatchObject({
      where: { tenantId: 'tenant-a', isActive: false },
      skip: 10,
      take: 10,
      orderBy: [{ name: 'asc' }, { id: 'desc' }],
    });
    expect(findManyArgs?.where?.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: 'acme', mode: 'insensitive' } },
      ]),
    );
    expect(countArgs?.where).toEqual(findManyArgs?.where);
  });

  it('uses bounded default pagination and deterministic newest-first order', async () => {
    await repository.findAll('tenant-a', {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-a' },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('deactivates a supplier with Purchase Order history', async () => {
    const supplierFindFirst = jest.fn().mockResolvedValue({
      id: 'supplier-a',
      isActive: true,
    });
    const purchaseOrderFindFirst = jest.fn().mockResolvedValue({ id: 'po-a' });
    const supplierUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const supplierDeleteMany = jest.fn();
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          supplier: {
            findFirst: supplierFindFirst,
            updateMany: supplierUpdateMany,
            deleteMany: supplierDeleteMany,
          },
          purchaseOrder: { findFirst: purchaseOrderFindFirst },
        }),
      ),
    );

    await expect(repository.delete('supplier-a', 'tenant-a')).resolves.toEqual({
      id: 'supplier-a',
      deactivated: true,
    });
    expect(supplierFindFirst).toHaveBeenCalledWith({
      where: { id: 'supplier-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(purchaseOrderFindFirst).toHaveBeenCalledWith({
      where: { supplierId: 'supplier-a', tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(supplierUpdateMany).toHaveBeenCalledWith({
      where: { id: 'supplier-a', tenantId: 'tenant-a' },
      data: { isActive: false },
    });
    expect(supplierDeleteMany).not.toHaveBeenCalled();
  });

  it('hard-deletes a supplier with no Purchase Order history', async () => {
    const supplierDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      Promise.resolve(
        callback({
          supplier: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'supplier-a',
              isActive: true,
            }),
            deleteMany: supplierDeleteMany,
          },
          purchaseOrder: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    );

    await expect(repository.delete('supplier-a', 'tenant-a')).resolves.toEqual({
      id: 'supplier-a',
      deactivated: false,
    });
    expect(supplierDeleteMany).toHaveBeenCalledWith({
      where: { id: 'supplier-a', tenantId: 'tenant-a' },
    });
  });
});
