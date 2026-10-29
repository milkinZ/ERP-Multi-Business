import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListIngredientsQueryDto } from './dto/list-ingredients-query.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';

describe('ListIngredientsQueryDto', () => {
  it('transforms pagination, trims search, and parses an inactive filter', async () => {
    const query = plainToInstance(ListIngredientsQueryDto, {
      page: '3',
      limit: '25',
      search: ' coffee ',
      isActive: 'false',
    });

    expect(await validate(query)).toHaveLength(0);
    expect(query).toMatchObject({
      page: 3,
      limit: 25,
      search: 'coffee',
      isActive: false,
    });
  });

  it('rejects malformed boolean filters and out-of-range pagination', async () => {
    const query = plainToInstance(ListIngredientsQueryDto, {
      page: '-1',
      limit: '101',
      isActive: 'yes',
    });

    expect(await validate(query)).toHaveLength(3);
  });
});

describe('UpdateIngredientDto', () => {
  it('trims and validates editable master-data fields', async () => {
    const dto = plainToInstance(UpdateIngredientDto, {
      name: ' Arabica ',
      unit: ' kg ',
      isActive: false,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      name: 'Arabica',
      unit: 'kg',
      isActive: false,
    });
  });

  it('rejects blank names, overlong units, and non-boolean status values', async () => {
    const dto = plainToInstance(UpdateIngredientDto, {
      name: ' ',
      unit: 'u'.repeat(33),
      isActive: 'false',
    });

    expect(await validate(dto)).toHaveLength(3);
  });
});
