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
      contactPerson: null,
      taxNumber: null,
    });
  });

  it('normalizes and forwards the extended supplier profile fields', async () => {
    create.mockResolvedValue({ id: 'supplier-a', tenantId: 'tenant-a' });
    update.mockResolvedValue({ id: 'supplier-a', tenantId: 'tenant-a' });

    await service.create('tenant-a', {
      name: 'Acme',
      contactPerson: '  Ada Lovelace ',
      taxNumber: '  TAX-123 ',
    });
    await service.update('supplier-a', 'tenant-a', {
      contactPerson: '  ',
      taxNumber: ' TAX-456 ',
    });

    expect(create).toHaveBeenLastCalledWith({
      tenantId: 'tenant-a',
      name: 'Acme',
      phone: null,
      email: null,
      address: null,
      contactPerson: 'Ada Lovelace',
      taxNumber: 'TAX-123',
    });
    expect(update).toHaveBeenLastCalledWith('supplier-a', 'tenant-a', {
      name: undefined,
      phone: undefined,
      email: undefined,
      address: undefined,
      contactPerson: null,
      taxNumber: 'TAX-456',
      isActive: undefined,
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
      contactPerson: undefined,
      taxNumber: undefined,
      isActive: undefined,
    });
    expect(remove).toHaveBeenCalledWith('supplier-b', 'tenant-a');
  });

  it('returns an explicit success result after tenant-scoped deletion', async () => {
    remove.mockResolvedValue({ id: 'supplier-a', deactivated: false });

    await expect(service.remove('supplier-a', 'tenant-a')).resolves.toEqual({
      success: true,
      deactivated: false,
    });
  });

  it('reports a referenced supplier as deactivated rather than deleted', async () => {
    remove.mockResolvedValue({ id: 'supplier-a', deactivated: true });

    await expect(service.remove('supplier-a', 'tenant-a')).resolves.toEqual({
      success: true,
      deactivated: true,
    });
  });
});
