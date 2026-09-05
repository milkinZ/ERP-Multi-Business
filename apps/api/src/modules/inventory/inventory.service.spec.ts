import { InventoryItemType } from '@prisma/client';

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

  it('lists inventory in the authenticated tenant and requested type', async () => {
    listInventoryItems.mockResolvedValue([
      { id: 'inventory-a', tenantId: 'tenant-a' },
    ]);

    await expect(
      service.listInventoryItems('tenant-a', InventoryItemType.PRODUCT),
    ).resolves.toEqual([{ id: 'inventory-a', tenantId: 'tenant-a' }]);
    expect(listInventoryItems).toHaveBeenCalledWith(
      'tenant-a',
      InventoryItemType.PRODUCT,
    );
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
    history.mockResolvedValue([]);
    historyByItem.mockResolvedValue([]);

    await expect(service.history('tenant-a')).resolves.toEqual([]);
    await expect(
      service.historyByItem('tenant-a', 'inventory-a'),
    ).resolves.toEqual([]);
    expect(history).toHaveBeenCalledWith('tenant-a');
    expect(historyByItem).toHaveBeenCalledWith('tenant-a', 'inventory-a');
  });
});
