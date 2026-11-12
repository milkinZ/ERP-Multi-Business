import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutletsRepository } from './outlets.repository';
import { OutletsService } from './outlets.service';
import { PlanEntitlementsService } from '../subscription/plans/plan-entitlements.service';

describe('OutletsService', () => {
  const findAll = jest.fn();
  const findOne = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const softDelete = jest.fn();
  const repository = {
    findAll,
    findOne,
    create,
    update,
    softDelete,
  } as unknown as OutletsRepository;
  const transactionClient = { $queryRaw: jest.fn() };
  const prisma = {
    $transaction: jest.fn(
      (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  } as unknown as PrismaService;
  const assertCanCreateOutlet = jest.fn().mockResolvedValue(undefined);
  const planEntitlements = {
    assertCanCreateOutlet,
  } as unknown as PlanEntitlementsService;
  const requireTenant = jest.fn();
  const tenantContext = { requireTenant } as unknown as TenantContextService;
  const service = new OutletsService(
    prisma,
    tenantContext,
    repository,
    planEntitlements,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    requireTenant.mockReturnValue('tenant-a');
  });

  it('reads only through the authenticated tenant context', async () => {
    findAll.mockResolvedValue({ data: [], total: 0 });

    const options = {
      page: 1,
      limit: 20,
      sortBy: 'name' as const,
      sortOrder: 'asc' as const,
      status: 'ACTIVE' as const,
    };

    await expect(service.findAll(options)).resolves.toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    expect(findAll).toHaveBeenCalledWith('tenant-a', options);
  });

  it('never accepts a client tenant id when creating an outlet', async () => {
    create.mockResolvedValue({ id: 'outlet-a', tenantId: 'tenant-a' });

    await service.create({ name: 'Main outlet' });

    expect(create).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-a',
        name: 'Main outlet',
      },
      transactionClient,
    );
    expect(assertCanCreateOutlet).toHaveBeenCalledWith(
      'tenant-a',
      transactionClient,
    );
  });

  it('returns not found when an update does not affect an active tenant outlet', async () => {
    update.mockResolvedValue({ count: 0 });

    await expect(
      service.update('outlet-b', { name: 'Changed' }),
    ).rejects.toThrow(new NotFoundException('Outlet not found'));
    expect(update).toHaveBeenCalledWith('outlet-b', 'tenant-a', {
      name: 'Changed',
    });
  });

  it('returns not found when a delete does not affect an active tenant outlet', async () => {
    softDelete.mockResolvedValue({ count: 0 });

    await expect(service.softDelete('outlet-b')).rejects.toThrow(
      new NotFoundException('Outlet not found'),
    );
    expect(softDelete).toHaveBeenCalledWith('outlet-b', 'tenant-a');
  });
});
