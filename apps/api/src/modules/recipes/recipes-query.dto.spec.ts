import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListRecipesQueryDto } from './dto/list-recipes-query.dto';

describe('ListRecipesQueryDto', () => {
  it('transforms bounded pagination and trims search', async () => {
    const dto = plainToInstance(ListRecipesQueryDto, {
      page: '2',
      limit: '10',
      search: '  coffee  ',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 10, search: 'coffee' });
  });

  it('rejects invalid pagination and excessive search input', async () => {
    const dto = plainToInstance(ListRecipesQueryDto, {
      page: '0',
      limit: '101',
      search: 'x'.repeat(101),
    });

    expect(await validate(dto)).toHaveLength(3);
  });
});
