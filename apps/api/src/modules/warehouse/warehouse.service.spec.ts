import { BadRequestException, NotFoundException } from '@nestjs/common';

import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const listStocks = jest.fn();
  const repository = {
    create,
    findAll,
    findOne,
    update,
    remove,
    listStocks,
  } as unknown as WarehouseRepository;
  let service: WarehouseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WarehouseService(repository);
  });

  it('creates a warehouse in the trusted tenant and outlet scope', async () => {
    create.mockResolvedValue({ id: 'warehouse-a', tenantId: 'tenant-a' });

    await expect(
      service.create('tenant-a', { name: 'Main', outletId: 'outlet-a' }),
    ).resolves.toEqual(expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        name: 'Main',
        outletId: 'outlet-a',
      }),
    );
  });

  it('lists only through the tenant-scoped repository contract', async () => {
    findAll.mockResolvedValue([]);

    await expect(service.findAll('tenant-a')).resolves.toEqual([]);
    expect(findAll).toHaveBeenCalledWith('tenant-a');
  });

  it('maps a missing warehouse to not found', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.findOne('warehouse-b', 'tenant-a')).rejects.toThrow(
      new NotFoundException('Warehouse not found'),
    );
    expect(findOne).toHaveBeenCalledWith('warehouse-b', 'tenant-a');
  });

  it('updates through the authenticated tenant scope', async () => {
    update.mockResolvedValue({ id: 'warehouse-a', tenantId: 'tenant-a' });

    await expect(
      service.update('warehouse-a', 'tenant-a', {
        name: 'Updated',
        outletId: null,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ id: 'warehouse-a', tenantId: 'tenant-a' }),
    );
    expect(update).toHaveBeenCalledWith('warehouse-a', 'tenant-a', {
      name: 'Updated',
      outletId: null,
    });
  });

  it('rejects empty updates and missing warehouse targets', async () => {
    await expect(service.update('warehouse-a', 'tenant-a', {})).rejects.toThrow(
      new BadRequestException('At least one warehouse field is required'),
    );

    update.mockResolvedValue(null);
    await expect(
      service.update('warehouse-b', 'tenant-a', { name: 'Updated' }),
    ).rejects.toThrow(new NotFoundException('Warehouse not found'));
  });

  it('removes through the tenant-scoped lifecycle repository', async () => {
    remove.mockResolvedValue({
      id: 'warehouse-a',
      deleted: false,
      deactivated: true,
    });

    await expect(service.remove('warehouse-a', 'tenant-a')).resolves.toEqual({
      id: 'warehouse-a',
      deleted: false,
      deactivated: true,
    });
    expect(remove).toHaveBeenCalledWith('warehouse-a', 'tenant-a');

    remove.mockResolvedValueOnce(null);
    await expect(service.remove('warehouse-b', 'tenant-a')).rejects.toThrow(
      new NotFoundException('Warehouse not found'),
    );
  });

  it('delegates stock listing with the authenticated tenant scope', async () => {
    const query = { page: 1, limit: 20 };
    listStocks.mockResolvedValue({ data: [], pagination: { total: 0 } });

    await expect(
      service.listStocks('warehouse-a', 'tenant-a', query),
    ).resolves.toEqual({ data: [], pagination: { total: 0 } });
    expect(listStocks).toHaveBeenCalledWith('warehouse-a', 'tenant-a', query);
  });
});
