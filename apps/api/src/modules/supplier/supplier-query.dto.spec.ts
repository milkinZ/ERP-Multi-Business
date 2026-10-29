import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListSuppliersQueryDto } from './dto/list-suppliers-query.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

describe('ListSuppliersQueryDto', () => {
  it('transforms and validates search, status, pagination, and sorting', async () => {
    const query = plainToInstance(ListSuppliersQueryDto, {
      page: '2',
      limit: '50',
      search: ' Acme ',
      isActive: 'false',
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query).toMatchObject({
      page: 2,
      limit: 50,
      search: 'Acme',
      isActive: false,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('rejects invalid status, sort values, and pagination bounds', async () => {
    const query = plainToInstance(ListSuppliersQueryDto, {
      page: '0',
      limit: '101',
      isActive: 'sometimes',
      sortBy: 'email',
      sortOrder: 'random',
    });

    expect(await validate(query)).toHaveLength(5);
  });
});

describe('UpdateSupplierDto', () => {
  it('accepts an explicit active-status change', async () => {
    const dto = plainToInstance(UpdateSupplierDto, { isActive: false });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });

  it('rejects a non-boolean active-status value', async () => {
    const dto = plainToInstance(UpdateSupplierDto, { isActive: 'false' });

    expect(await validate(dto)).toHaveLength(1);
  });
});
