import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListPurchaseOrdersQueryDto } from './dto/list-purchase-orders-query.dto';

describe('ListPurchaseOrdersQueryDto', () => {
  it('transforms and validates list filters', async () => {
    const dto = plainToInstance(ListPurchaseOrdersQueryDto, {
      skip: '20',
      take: '50',
      supplierId: ' supplier-a ',
      search: ' PO-100 ',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      sortBy: 'totalAmount',
      sortOrder: 'asc',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      skip: 20,
      take: 50,
      supplierId: 'supplier-a',
      search: 'PO-100',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      sortBy: 'totalAmount',
      sortOrder: 'asc',
    });
  });

  it('rejects invalid pagination, status, date, and sort parameters', async () => {
    const dto = plainToInstance(ListPurchaseOrdersQueryDto, {
      skip: '-1',
      take: '101',
      status: 'UNKNOWN',
      fromDate: 'not-a-date',
      sortBy: 'supplierId',
      sortOrder: 'sideways',
    });

    expect(await validate(dto)).toHaveLength(6);
  });
});
