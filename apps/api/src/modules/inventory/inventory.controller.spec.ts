import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryController', () => {
  const stockIn = jest.fn();
  const adjustment = jest.fn();
  const waste = jest.fn();
  const history = jest.fn();
  const items = jest.fn();
  const historyByItem = jest.fn();
  const stockBalances = jest.fn();
  const availability = jest.fn();
  const getReorderRules = jest.fn();
  const replaceReorderRules = jest.fn();
  const findInventoryItem = jest.fn();
  const createTransfer = jest.fn();
  const findAllTransfers = jest.fn();
  const findTransfer = jest.fn();
  const shipTransfer = jest.fn();
  const receiveTransfer = jest.fn();
  const cancelTransfer = jest.fn();
  const service = {
    stockIn,
    adjustment,
    waste,
    history,
    listInventoryItems: items,
    historyByItem,
    stockBalances,
    availability,
    getReorderRules,
    replaceReorderRules,
    findInventoryItem,
  } as unknown as InventoryService;
  const transferService = {
    create: createTransfer,
    findAll: findAllTransfers,
    findOne: findTransfer,
    ship: shipTransfer,
    receive: receiveTransfer,
    cancel: cancelTransfer,
  } as never;
  const user = { userId: 'user-a', tenantId: 'tenant-a' } as never;
  let controller: InventoryController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InventoryController(service, transferService);
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
    history.mockResolvedValue({});
    items.mockResolvedValue({});
    historyByItem.mockResolvedValue({});
    const itemQuery = { type: 'PRODUCT', page: 1, limit: 20 } as never;
    const historyQuery = { warehouseId: 'warehouse-a', page: 1 } as never;

    await controller.history(user, historyQuery);
    await controller.items(user, itemQuery);
    await controller.historyByItem('item-a', user, historyQuery);
    await controller.stockBalances('item-a', user);
    await controller.availability('item-a', user);
    await controller.reorderRules('item-a', user);
    const reorderRulesDto = { scope: 'TENANT_ITEM_TOTAL', rules: [] } as never;
    await controller.replaceReorderRules('item-a', reorderRulesDto, user);
    await controller.getInventoryItem('item-a', user);

    expect(history).toHaveBeenCalledWith('tenant-a', historyQuery);
    expect(items).toHaveBeenCalledWith('tenant-a', itemQuery);
    expect(historyByItem).toHaveBeenCalledWith(
      'tenant-a',
      'item-a',
      historyQuery,
    );
    expect(stockBalances).toHaveBeenCalledWith('tenant-a', 'item-a');
    expect(availability).toHaveBeenCalledWith('tenant-a', 'item-a');
    expect(getReorderRules).toHaveBeenCalledWith('tenant-a', 'item-a');
    expect(replaceReorderRules).toHaveBeenCalledWith(
      'tenant-a',
      'item-a',
      reorderRulesDto,
    );
    expect(findInventoryItem).toHaveBeenCalledWith('tenant-a', 'item-a');
  });

  it('uses authenticated tenant, actor, and idempotency keys for transfer mutations', async () => {
    const createDto = { sourceWarehouseId: 'warehouse-a' } as never;
    const receiptDto = { items: [] } as never;
    createTransfer.mockResolvedValue({});
    findAllTransfers.mockResolvedValue({});
    findTransfer.mockResolvedValue({});
    shipTransfer.mockResolvedValue({});
    receiveTransfer.mockResolvedValue({});
    cancelTransfer.mockResolvedValue({});

    await controller.createTransfer(createDto, user, 'create-key');
    await controller.listTransfers(user, '5', '10');
    await controller.getTransfer('transfer-a', user);
    await controller.shipTransfer('transfer-a', user);
    await controller.receiveTransfer(
      'transfer-a',
      user,
      'receipt-key',
      receiptDto,
    );
    await controller.cancelTransfer('transfer-a', user);

    expect(createTransfer).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'create-key',
      createDto,
    );
    expect(findAllTransfers).toHaveBeenCalledWith('tenant-a', 5, 10);
    expect(findTransfer).toHaveBeenCalledWith('tenant-a', 'transfer-a');
    expect(shipTransfer).toHaveBeenCalledWith(
      'tenant-a',
      'transfer-a',
      'user-a',
    );
    expect(receiveTransfer).toHaveBeenCalledWith(
      'tenant-a',
      'transfer-a',
      'user-a',
      'receipt-key',
      receiptDto,
    );
    expect(cancelTransfer).toHaveBeenCalledWith('tenant-a', 'transfer-a');
  });

  it('rejects transfer mutations without their required idempotency keys', () => {
    expect(() =>
      controller.createTransfer({} as never, user, undefined),
    ).toThrow('Idempotency-Key header is required');
    expect(() =>
      controller.receiveTransfer('transfer-a', user, undefined, {} as never),
    ).toThrow('Idempotency-Key header is required');
  });

  it('rejects invalid transfer pagination instead of silently coercing it', () => {
    expect(() => controller.listTransfers(user, '2items', '10')).toThrow(
      'skip must be a non-negative integer',
    );
    expect(() => controller.listTransfers(user, '0', '0')).toThrow(
      'take must be between 1 and 100',
    );
    expect(() => controller.listTransfers(user, '0', '101')).toThrow(
      'take must be between 1 and 100',
    );
  });
});
