import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const service = { create, findAll, findOne } as unknown as ProductsService;
  let controller: ProductsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProductsController(service);
  });

  it('derives tenantId from authenticated user instead of request payload', async () => {
    create.mockResolvedValue({ id: 'product-a', tenantId: 'tenant-a' });

    await controller.create(
      { name: 'Coffee', price: 250, tenantId: 'attacker-tenant' } as never,
      { userId: 'user-a', tenantId: 'tenant-a', permissions: [] } as never,
    );

    expect(create).toHaveBeenCalledWith({
      name: 'Coffee',
      price: 250,
      tenantId: 'tenant-a',
    });
  });

  it('uses authenticated tenant scope for list and item reads', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);
    const user = { tenantId: 'tenant-a' } as never;

    await controller.findAll(user);
    await controller.findOne('product-b', user);

    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('product-b', 'tenant-a');
  });
});
