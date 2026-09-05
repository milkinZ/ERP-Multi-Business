import { BadRequestException } from '@nestjs/common';

import { WarehouseRepository } from './warehouse.repository';
import { WarehouseService } from './warehouse.service';

describe('WarehouseService', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const repository = {
    create,
    findAll,
    findOne,
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

  it('maps a missing warehouse to a client error', async () => {
    findOne.mockResolvedValue(null);

    await expect(service.findOne('warehouse-b', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Warehouse not found'),
    );
    expect(findOne).toHaveBeenCalledWith('warehouse-b', 'tenant-a');
  });
});
