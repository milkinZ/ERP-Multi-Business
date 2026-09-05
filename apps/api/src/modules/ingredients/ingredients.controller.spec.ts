import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';

describe('IngredientsController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const service = { create, findAll, findOne } as unknown as IngredientsService;
  let controller: IngredientsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IngredientsController(service);
  });

  it('uses authenticated tenant context for creation', async () => {
    create.mockResolvedValue({ id: 'ingredient-a', tenantId: 'tenant-a' });
    const dto = { name: 'Coffee beans', unit: 'kg' } as never;

    await controller.create(dto, { tenantId: 'tenant-a' } as never);

    expect(create).toHaveBeenCalledWith('tenant-a', dto);
  });

  it('keeps ingredient reads tenant-scoped', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null);
    const user = { tenantId: 'tenant-a' } as never;

    await controller.findAll(user);
    await controller.findOne('ingredient-b', user);

    expect(findAll).toHaveBeenCalledWith('tenant-a');
    expect(findOne).toHaveBeenCalledWith('ingredient-b', 'tenant-a');
  });
});
