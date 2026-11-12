import { BadRequestException } from '@nestjs/common';

import { PlatformSchedulerExecutionService } from './platform-scheduler-execution.service';

describe('PlatformSchedulerExecutionService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const realtime = { publishRefresh: jest.fn() };
  let service: PlatformSchedulerExecutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(1);
    realtime.publishRefresh.mockResolvedValue(undefined);
    service = new PlatformSchedulerExecutionService(
      prisma as never,
      realtime as never,
    );
  });

  it('records successful scheduler executions and publishes a refresh signal', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'scheduler-run-1' }]);

    await expect(
      service.execute('outbox-dispatch', () => Promise.resolve('completed')),
    ).resolves.toBe('completed');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(realtime.publishRefresh).toHaveBeenCalledTimes(1);
  });

  it('records failures and rethrows the original scheduler error', async () => {
    const failure = new Error('database unavailable');
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'scheduler-run-2' }]);

    await expect(
      service.execute('autopay', () => Promise.reject(failure)),
    ).rejects.toBe(failure);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(realtime.publishRefresh).toHaveBeenCalledTimes(1);
  });

  it('returns paginated run history with the configured retention period', async () => {
    const run = {
      id: 'scheduler-run-3',
      schedulerName: 'outbox-dispatch',
      status: 'SUCCEEDED',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 125,
      errorCode: null,
    };
    prisma.$queryRaw
      .mockResolvedValueOnce([run])
      .mockResolvedValueOnce([{ total: 1n }]);

    await expect(service.list({ page: 1, limit: 25 })).resolves.toEqual({
      data: [run],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
      retentionDays: 30,
    });
  });

  it('rejects scheduler history older than the retention window', async () => {
    const from = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);

    await expect(
      service.list({ from: from.toISOString(), page: 1, limit: 25 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('purges scheduler runs and job attempts outside the retention window', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'retention-run' }]);
    prisma.$executeRaw.mockResolvedValue(0);

    await service.purgeExpired();

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
    expect(realtime.publishRefresh).toHaveBeenCalledTimes(1);
  });
});
