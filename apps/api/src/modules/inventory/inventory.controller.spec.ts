import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  const stockIn = jest.fn();
  const adjustment = jest.fn();
  const waste = jest.fn();
  const history = jest.fn();
  const items = jest.fn();
  const historyByItem = jest.fn();
  const service = {
    stockIn,
    adjustment,
    waste,
    history,
    listInventoryItems: items,
    historyByItem,
  } as unknown as InventoryService;
  const user = { userId: 'user-a', tenantId: 'tenant-a' } as never;
  let controller: InventoryController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InventoryController(service);
  });

  it('uses authenticated tenant and actor for inventory mutations', async () => {
    const dto = { inventoryItemId: 'item-a', quantity: 2 } as never;
    stockIn.mockResolvedValue({});
    adjustment.mockResolvedValue({});
    waste.mockResolvedValue({});

    await controller.stockIn(dto, user);
    await controller.adjustment(dto, user);
    await controller.waste(dto, user);

    expect(stockIn).toHaveBeenCalledWith('tenant-a', dto, 'user-a');
    expect(adjustment).toHaveBeenCalledWith('tenant-a', dto, 'user-a');
    expect(waste).toHaveBeenCalledWith('tenant-a', dto, 'user-a');
  });

  it('keeps inventory reads tenant-scoped', async () => {
    history.mockResolvedValue([]);
    items.mockResolvedValue([]);
    historyByItem.mockResolvedValue([]);
    const query = { type: 'PRODUCT' } as never;

    await controller.history(user);
    await controller.items(user, query);
    await controller.historyByItem('item-a', user);

    expect(history).toHaveBeenCalledWith('tenant-a');
    expect(items).toHaveBeenCalledWith('tenant-a', 'PRODUCT');
    expect(historyByItem).toHaveBeenCalledWith('tenant-a', 'item-a');
  });
});
