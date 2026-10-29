import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { UserOutletsService } from './user-outlets.service';

describe('UserOutletsService', () => {
  const userFindFirst = jest.fn();
  const outletFindMany = jest.fn();
  const assignmentFindMany = jest.fn();
  const assignmentUpdateMany = jest.fn();
  const assignmentCreateMany = jest.fn();
  const transactionClient = {
    user: { findFirst: userFindFirst },
    outlet: { findMany: outletFindMany },
    userOutlet: {
      updateMany: assignmentUpdateMany,
      createMany: assignmentCreateMany,
    },
  };
  const transaction = jest.fn(
    (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  const prisma = {
    $transaction: transaction,
    userOutlet: { findMany: assignmentFindMany },
  } as unknown as PrismaService;
  const service = new UserOutletsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    userFindFirst.mockResolvedValue({ id: 'user-a' });
    outletFindMany.mockResolvedValue([{ id: 'outlet-a' }]);
    assignmentUpdateMany.mockResolvedValue({ count: 0 });
    assignmentCreateMany.mockResolvedValue({ count: 1 });
    assignmentFindMany.mockResolvedValue([]);
  });

  it('validates tenant ownership and atomically replaces user outlets', async () => {
    await service.setUserOutlets('tenant-a', 'user-a', [
      'outlet-a',
      'outlet-a',
    ]);

    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: 'user-a', tenantId: 'tenant-a', deletedAt: null },
      select: { id: true },
    });
    expect(outletFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['outlet-a'] },
        tenantId: 'tenant-a',
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(assignmentUpdateMany).toHaveBeenCalledTimes(1);
    expect(assignmentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 'tenant-a',
          userId: 'user-a',
          outletId: 'outlet-a',
          deletedAt: null,
        },
      ],
    });
  });

  it('does not mutate assignments when the target user is outside the tenant', async () => {
    userFindFirst.mockResolvedValue(null);

    await expect(
      service.setUserOutlets('tenant-a', 'user-b', ['outlet-a']),
    ).rejects.toThrow(new NotFoundException('User not found'));

    expect(assignmentUpdateMany).not.toHaveBeenCalled();
    expect(assignmentCreateMany).not.toHaveBeenCalled();
  });

  it('does not revoke assignments when any submitted outlet is outside the tenant', async () => {
    outletFindMany.mockResolvedValue([]);

    await expect(
      service.setUserOutlets('tenant-a', 'user-a', ['outlet-b']),
    ).rejects.toThrow(new NotFoundException('One or more outlets not found'));

    expect(assignmentUpdateMany).not.toHaveBeenCalled();
    expect(assignmentCreateMany).not.toHaveBeenCalled();
  });
});
