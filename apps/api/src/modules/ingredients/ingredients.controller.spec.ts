import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';

describe('IngredientsController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const update = jest.fn();
  const remove = jest.fn();
  const service = {
    create,
    findAll,
    findOne,
    update,
    remove,
  } as unknown as IngredientsService;
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

    const query = { page: 2, limit: 10 } as never;
    await controller.findAll(query, user);
    await controller.findOne('ingredient-b', user);

    expect(findAll).toHaveBeenCalledWith('tenant-a', query);
    expect(findOne).toHaveBeenCalledWith('ingredient-b', 'tenant-a');
  });

  it('uses authenticated tenant context for updates', async () => {
    const dto = { name: 'Arabica', isActive: false } as never;

    await controller.update('ingredient-a', dto, {
      tenantId: 'tenant-a',
    } as never);

    expect(update).toHaveBeenCalledWith('ingredient-a', 'tenant-a', dto);
  });

  it('uses authenticated tenant context for removal', async () => {
    await controller.remove('ingredient-a', { tenantId: 'tenant-a' } as never);

    expect(remove).toHaveBeenCalledWith('ingredient-a', 'tenant-a');
  });
});
