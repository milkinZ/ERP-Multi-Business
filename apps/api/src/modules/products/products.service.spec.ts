import { BadRequestException } from '@nestjs/common';

import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';

describe('ProductsService', () => {
  const createFromDto = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const repository = {
    createFromDto,
    findAll,
    findOne,
  } as unknown as ProductsRepository;
  let service: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService({} as never, repository);
  });

  it('creates a product in the trusted tenant scope', async () => {
    const product = { id: 'product-a', tenantId: 'tenant-a' };
    createFromDto.mockResolvedValue(product);

    await expect(
      service.create({
        name: 'Coffee',
        price: 250,
        sku: 'COFFEE-1',
        tenantId: 'tenant-a',
      }),
    ).resolves.toBe(product);
    expect(createFromDto).toHaveBeenCalledWith({
      name: 'Coffee',
      description: null,
      price: 250,
      sku: 'COFFEE-1',
      tenantId: 'tenant-a',
    });
  });

  it('maps repository failures to a bad request', async () => {
    createFromDto.mockRejectedValue(new Error('SKU already exists'));

    await expect(
      service.create({ name: 'Coffee', price: 250, tenantId: 'tenant-a' }),
    ).rejects.toThrow(new BadRequestException('SKU already exists'));
  });

  it('preserves tenant scope for reads and not-found results', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);

    await expect(service.findAll('tenant-a')).resolves.toEqual([]);
    await expect(service.findOne('product-b', 'tenant-a')).resolves.toBeNull();
    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('product-b', 'tenant-a');
  });
});
