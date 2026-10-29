import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseStocksQueryDto } from './dto/warehouse-stocks-query.dto';

describe('UpdateWarehouseDto', () => {
  it('trims fields and normalizes an empty outlet to tenant-wide', async () => {
    const dto = plainToInstance(UpdateWarehouseDto, {
      name: '  Main warehouse  ',
      outletId: '  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Main warehouse');
    expect(dto.outletId).toBeNull();
  });

  it('rejects invalid warehouse fields and excessive lengths', async () => {
    const dto = plainToInstance(UpdateWarehouseDto, {
      name: '  ',
      outletId: 'x'.repeat(129),
    });

    expect(await validate(dto)).toHaveLength(2);
  });
});

describe('WarehouseStocksQueryDto', () => {
  it('transforms pagination and trims search input', async () => {
    const dto = plainToInstance(WarehouseStocksQueryDto, {
      page: '2',
      limit: '10',
      search: '  coffee  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 10, search: 'coffee' });
  });

  it('rejects out-of-range pagination and excessively long search input', async () => {
    const dto = plainToInstance(WarehouseStocksQueryDto, {
      page: '0',
      limit: '101',
      search: 'x'.repeat(101),
    });

    expect(await validate(dto)).toHaveLength(3);
  });
});
