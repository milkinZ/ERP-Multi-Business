import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const findByEmail = jest.fn();
  const createUser = jest.fn();
  const repository = { findByEmail, createUser } as unknown as UsersRepository;
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService({} as never, repository);
  });

  it('finds users by email without widening the query scope', async () => {
    const user = { id: 'user-a', tenantId: 'tenant-a' };
    findByEmail.mockResolvedValue(user);

    await expect(service.findByEmail('user-a@example.test')).resolves.toBe(
      user,
    );
    expect(findByEmail).toHaveBeenCalledWith('user-a@example.test');
  });

  it('passes the already-hashed password and trusted tenant to persistence', async () => {
    createUser.mockResolvedValue({ id: 'user-a', tenantId: 'tenant-a' });

    await expect(
      service.create({
        email: 'user-a@example.test',
        password: 'hashed-password',
        tenantId: 'tenant-a',
      }),
    ).resolves.toEqual(expect.objectContaining({ tenantId: 'tenant-a' }));
    expect(createUser).toHaveBeenCalledWith({
      email: 'user-a@example.test',
      passwordHash: 'hashed-password',
      tenantId: 'tenant-a',
    });
  });
});
