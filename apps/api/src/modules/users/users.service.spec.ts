import { ConflictException, ForbiddenException } from '@nestjs/common';

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

  it('prevents an actor from deactivating their own account', async () => {
    const transaction = jest.fn();
    const guardedService = new UsersService(
      { $transaction: transaction } as never,
      repository,
    );

    await expect(
      guardedService.setStatus('tenant-a', 'user-a', 'user-a', false),
    ).rejects.toThrow(
      new ForbiddenException('You cannot deactivate your own account'),
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('keeps the last active user administrator enabled', async () => {
    const userFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'user-a', isActive: true });
    const userCount = jest.fn().mockResolvedValue(0);
    const userUpdateMany = jest.fn();
    const refreshTokenUpdateMany = jest.fn();
    const sessionUpdateMany = jest.fn();
    const transactionClient = {
      $queryRaw: jest.fn(),
      user: {
        findFirst: userFindFirst,
        count: userCount,
        updateMany: userUpdateMany,
      },
      refreshToken: { updateMany: refreshTokenUpdateMany },
      session: { updateMany: sessionUpdateMany },
    };
    const transaction = jest.fn(
      (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    );
    const guardedService = new UsersService(
      { $transaction: transaction } as never,
      repository,
    );

    await expect(
      guardedService.setStatus('tenant-a', 'actor-a', 'user-a', false),
    ).rejects.toThrow(
      new ConflictException(
        'The last active user administrator cannot be deactivated',
      ),
    );
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(refreshTokenUpdateMany).not.toHaveBeenCalled();
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });
});
