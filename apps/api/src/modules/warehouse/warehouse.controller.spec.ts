import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

describe('WarehouseController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const listStocks = jest.fn();
  const service = {
    create,
    findAll,
    findOne,
    update,
    remove,
    listStocks,
  } as unknown as WarehouseService;
  const user = { tenantId: 'tenant-a' } as never;
  let controller: WarehouseController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WarehouseController(service);
  });

  it('uses authenticated tenant context for warehouse creation', async () => {
    const dto = { name: 'Main', outletId: 'outlet-a' } as never;
    create.mockResolvedValue({ id: 'warehouse-a', tenantId: 'tenant-a' });

    await controller.create(dto, user);

    expect(create).toHaveBeenCalledWith('tenant-a', dto);
  });

  it('keeps warehouse reads tenant-scoped', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);

    await controller.findAll(user);
    await controller.findOne('warehouse-b', user);

    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('warehouse-b', 'tenant-a');
  });

  it('uses the authenticated tenant for warehouse updates', async () => {
    const dto = { name: 'Updated' } as never;
    update.mockResolvedValue({ id: 'warehouse-a', tenantId: 'tenant-a' });

    await controller.update('warehouse-a', dto, user);

    expect(update).toHaveBeenCalledWith('warehouse-a', 'tenant-a', dto);
  });

  it('uses the authenticated tenant for warehouse removal', async () => {
    remove.mockResolvedValue({ id: 'warehouse-a', deleted: true });

    await controller.remove('warehouse-a', user);

    expect(remove).toHaveBeenCalledWith('warehouse-a', 'tenant-a');
  });

  it('uses the authenticated tenant for stock lookup', async () => {
    const query = { page: 1, limit: 20 } as never;

    await controller.listStocks('warehouse-a', query, user);

    expect(listStocks).toHaveBeenCalledWith('warehouse-a', 'tenant-a', query);
  });
});
