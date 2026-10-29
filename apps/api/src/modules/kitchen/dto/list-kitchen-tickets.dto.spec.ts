import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { KitchenStatus } from '../domain/kitchen-status.enum';
import { ListKitchenTicketsDto } from './list-kitchen-tickets.dto';

describe('ListKitchenTicketsDto', () => {
  it('transforms and accepts valid queue filters and pagination', () => {
    const dto = plainToInstance(ListKitchenTicketsDto, {
      status: KitchenStatus.QUEUED,
      search: '  order-a  ',
      skip: '50',
      take: '50',
    });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      status: KitchenStatus.QUEUED,
      search: 'order-a',
      skip: 50,
      take: 50,
    });
  });

  it('rejects unsupported statuses, non-integer offsets, and oversized pages', () => {
    const dto = plainToInstance(ListKitchenTicketsDto, {
      status: KitchenStatus.SERVED,
      skip: '-1',
      take: '101',
    });

    expect(
      validateSync(dto)
        .map((error) => error.property)
        .sort(),
    ).toEqual(['skip', 'status', 'take']);
  });
});
