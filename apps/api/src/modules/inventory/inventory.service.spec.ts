import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  const listInventoryItems = jest.fn();
  const stockIn = jest.fn();
  const adjustment = jest.fn();
  const waste = jest.fn();
  const history = jest.fn();
  const historyByItem = jest.fn();
  const repository = {
    listInventoryItems,
    stockIn,
    adjustment,
    waste,
    history,
    historyByItem,
  } as unknown as InventoryRepository;
  let service: InventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryService(repository);
  });

  it('lists inventory in the authenticated tenant using the requested filters', async () => {
    const result = {
      data: [{ id: 'inventory-a', tenantId: 'tenant-a' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    const query = { type: 'PRODUCT', page: 1, limit: 20 } as never;
    listInventoryItems.mockResolvedValue(result);

    await expect(service.listInventoryItems('tenant-a', query)).resolves.toBe(
      result,
    );
    expect(listInventoryItems).toHaveBeenCalledWith('tenant-a', query);
  });

  it('passes trusted tenant and actor context to stock mutations', async () => {
    stockIn.mockResolvedValue({ movementId: 'movement-a' });
    adjustment.mockResolvedValue({ movementId: 'movement-b' });
    waste.mockResolvedValue({ movementId: 'movement-c' });
    const stockInDto = { inventoryItemId: 'inventory-a', quantity: 5 } as never;
    const adjustmentDto = {
      inventoryItemId: 'inventory-a',
      quantity: 2,
    } as never;
    const wasteDto = { inventoryItemId: 'inventory-a', quantity: 1 } as never;

    await service.stockIn('tenant-a', stockInDto, 'user-a');
    await service.adjustment('tenant-a', adjustmentDto, 'user-a');
    await service.waste('tenant-a', wasteDto, 'user-a');

    expect(stockIn).toHaveBeenCalledWith('tenant-a', stockInDto, 'user-a');
    expect(adjustment).toHaveBeenCalledWith(
      'tenant-a',
      adjustmentDto,
      'user-a',
    );
    expect(waste).toHaveBeenCalledWith('tenant-a', wasteDto, 'user-a');
  });

  it('returns tenant-scoped movement history including empty results', async () => {
    const result = {
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
    const query = { page: 1, limit: 20 } as never;
    history.mockResolvedValue(result);
    historyByItem.mockResolvedValue(result);

    await expect(service.history('tenant-a', query)).resolves.toBe(result);
    await expect(
      service.historyByItem('tenant-a', 'inventory-a', query),
    ).resolves.toBe(result);
    expect(history).toHaveBeenCalledWith('tenant-a', query);
    expect(historyByItem).toHaveBeenCalledWith(
      'tenant-a',
      'inventory-a',
      query,
    );
  });
});
