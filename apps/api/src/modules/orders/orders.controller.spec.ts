import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const updateStatus = jest.fn();
  const service = {
    create,
    findAll,
    findOne,
    updateStatus,
  } as unknown as OrdersService;
  let controller: OrdersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OrdersController(service);
  });

  it('takes tenant and outlet only from authenticated user context', async () => {
    create.mockResolvedValue({ id: 'order-a', tenantId: 'tenant-a' });

    await controller.create(
      {
        items: [{ productId: 'product-a', quantity: 1 }],
        tenantId: 'attacker',
      } as never,
      { tenantId: 'tenant-a', outletId: 'outlet-a' } as never,
    );

    expect(create).toHaveBeenCalledWith('tenant-a', 'outlet-a', [
      { productId: 'product-a', quantity: 1 },
    ]);
  });

  it('passes authenticated user to tenant-scoped reads and status updates', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);
    updateStatus.mockResolvedValue({ id: 'order-a' });
    const user = { tenantId: 'tenant-a', outletId: 'outlet-a' } as never;

    await controller.findAll(user);
    await controller.findOne('order-a', user);
    await controller.updateStatus(
      'order-a',
      { status: 'CANCELLED' } as never,
      user,
    );

    expect(findAll).toHaveBeenCalledWith(user);
    expect(findOne).toHaveBeenCalledWith('order-a', user);
    expect(updateStatus).toHaveBeenCalledWith('order-a', user, 'CANCELLED');
  });
});
