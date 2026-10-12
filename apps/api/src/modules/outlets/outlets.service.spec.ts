import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { TenantContextService } from '../tenants/tenant-context.service';
import { OutletsRepository } from './outlets.repository';
import { OutletsService } from './outlets.service';

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
  const requireTenant = jest.fn();
  const tenantContext = { requireTenant } as unknown as TenantContextService;
  const service = new OutletsService(
    {} as PrismaService,
    tenantContext,
    repository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    requireTenant.mockReturnValue('tenant-a');
  });

  it('reads only through the authenticated tenant context', async () => {
    findAll.mockResolvedValue([]);

    await service.findAll();

    expect(findAll).toHaveBeenCalledWith('tenant-a');
  });

  it('never accepts a client tenant id when creating an outlet', async () => {
    create.mockResolvedValue({ id: 'outlet-a', tenantId: 'tenant-a' });

    await service.create({ name: 'Main outlet' });

    expect(create).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      name: 'Main outlet',
    });
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
