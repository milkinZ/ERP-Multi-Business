import { BadRequestException } from '@nestjs/common';

import { SupplierRepository } from './supplier.repository';
import { SupplierService } from './supplier.service';

describe('SupplierService', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const repository = {
    create,
    findAll,
    findOne,
    update,
    delete: remove,
  } as unknown as SupplierRepository;
  let service: SupplierService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SupplierService(repository);
  });

  it('creates a supplier with normalized optional fields and tenant scope', async () => {
    create.mockResolvedValue({ id: 'supplier-a', tenantId: 'tenant-a' });

    await expect(service.create('tenant-a', { name: 'Acme' })).resolves.toEqual(
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
    expect(create).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      name: 'Acme',
      phone: null,
      email: null,
      address: null,
    });
  });

  it('maps missing update and delete targets to errors', async () => {
    update.mockResolvedValue(null);
    remove.mockResolvedValue(null);

    await expect(
      service.update('supplier-b', 'tenant-a', { name: 'Updated' }),
    ).rejects.toThrow(new BadRequestException('Supplier not found'));
    await expect(service.remove('supplier-b', 'tenant-a')).rejects.toThrow(
      new BadRequestException('Supplier not found'),
    );
    expect(update).toHaveBeenCalledWith('supplier-b', 'tenant-a', {
      name: 'Updated',
      phone: undefined,
      email: undefined,
      address: undefined,
    });
    expect(remove).toHaveBeenCalledWith('supplier-b', 'tenant-a');
  });

  it('returns an explicit success result after tenant-scoped deletion', async () => {
    remove.mockResolvedValue({ id: 'supplier-a' });

    await expect(service.remove('supplier-a', 'tenant-a')).resolves.toEqual({
      success: true,
    });
  });
});
