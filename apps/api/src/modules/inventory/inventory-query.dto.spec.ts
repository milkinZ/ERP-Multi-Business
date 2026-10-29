import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { InventoryHistoryListQueryDto } from './dto/inventory-history-list.dto';
import { InventoryItemListQueryDto } from './dto/inventory-item-list.dto';

describe('Inventory list query DTOs', () => {
  it('transforms pagination values and trims item filters', async () => {
    const query = plainToInstance(InventoryItemListQueryDto, {
      page: '2',
      limit: '50',
      search: ' coffee ',
      warehouseId: ' warehouse-a ',
      type: 'INGREDIENT',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query.page).toBe(2);
    expect(query.limit).toBe(50);
    expect(query.search).toBe('coffee');
    expect(query.warehouseId).toBe('warehouse-a');
    expect(query.sortBy).toBe('name');
    expect(query.sortOrder).toBe('asc');
  });

  it('rejects out-of-range pagination and invalid inventory types', async () => {
    const query = plainToInstance(InventoryItemListQueryDto, {
      page: '0',
      limit: '101',
      type: 'UNKNOWN',
      sortBy: 'arbitrary',
      sortOrder: 'sideways',
    });

    expect(await validate(query)).toHaveLength(5);
  });

  it('validates movement filters and pagination consistently', async () => {
    const validQuery = plainToInstance(InventoryHistoryListQueryDto, {
      page: '1',
      limit: '100',
      search: ' delivery ',
      type: 'STOCK_IN',
      warehouseId: 'warehouse-a',
      sortBy: 'quantity',
      sortOrder: 'asc',
    });
    const invalidQuery = plainToInstance(InventoryHistoryListQueryDto, {
      page: '-1',
      limit: '0',
      type: 'NOT_A_MOVEMENT',
      sortBy: 'note',
      sortOrder: 'sideways',
    });

    expect(await validate(validQuery)).toHaveLength(0);
    expect(validQuery.search).toBe('delivery');
    expect(validQuery.sortBy).toBe('quantity');
    expect(validQuery.sortOrder).toBe('asc');
    expect(await validate(invalidQuery)).toHaveLength(5);
  });
});
