import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';

describe('SupplierController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const service = {
    create,
    findAll,
    findOne,
    update,
    remove,
  } as unknown as SupplierService;
  const user = { tenantId: 'tenant-a' } as never;
  let controller: SupplierController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SupplierController(service);
  });

  it('uses authenticated tenant for create, update, and delete', async () => {
    const dto = { name: 'Acme' } as never;
    create.mockResolvedValue({ id: 'supplier-a' });
    update.mockResolvedValue({ id: 'supplier-a' });
    remove.mockResolvedValue({ success: true });

    await controller.create(dto, user);
    await controller.update('supplier-a', dto, user);
    await controller.remove('supplier-a', user);

    expect(create).toHaveBeenCalledWith('tenant-a', dto);
    expect(update).toHaveBeenCalledWith('supplier-a', 'tenant-a', dto);
    expect(remove).toHaveBeenCalledWith('supplier-a', 'tenant-a');
  });

  it('keeps supplier reads tenant-scoped', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);

    await controller.findAll(user);
    await controller.findOne('supplier-b', user);

    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('supplier-b', 'tenant-a');
  });
});
