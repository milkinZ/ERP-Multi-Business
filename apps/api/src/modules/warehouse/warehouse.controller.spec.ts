import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

describe('WarehouseController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const service = { create, findAll, findOne } as unknown as WarehouseService;
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
});
