import { HealthService } from './health.service';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const outboxCount = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    outboxEvent: { count: outboxCount },
  } as unknown as PrismaService;
  const getQueue = jest.fn();
  const queueService = { getQueue } as unknown as QueueService;
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    outboxCount.mockResolvedValue(0);
    getQueue.mockReturnValue({
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
      getJobCounts: jest.fn().mockResolvedValue({}),
    });
    service = new HealthService(prisma, queueService);
  });

  it('reports database and outbox health', async () => {
    await expect(service.checkDb()).resolves.toEqual({ ok: true });
    await expect(service.checkOutbox()).resolves.toEqual({
      ok: true,
      pending: 0,
    });
    expect(outboxCount).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
  });

  it('reports database failure without exposing non-error objects', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));

    await expect(service.checkDb()).resolves.toEqual({
      ok: false,
      error: 'database unavailable',
    });
  });

  it('classifies queue health as UP, DEGRADED, or DOWN', async () => {
    await expect(service.checkBullmq()).resolves.toEqual(
      expect.objectContaining({ ok: true, status: 'UP' }),
    );

    const failingQueue = {
      waitUntilReady: jest.fn().mockRejectedValue(new Error('queue down')),
      getJobCounts: jest.fn(),
    };
    getQueue.mockReturnValueOnce(failingQueue).mockReturnValue({
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
      getJobCounts: jest.fn().mockResolvedValue({}),
    });
    await expect(service.checkBullmq()).resolves.toEqual(
      expect.objectContaining({ ok: false, status: 'DEGRADED' }),
    );

    getQueue.mockReturnValue(failingQueue);
    await expect(service.checkBullmq()).resolves.toEqual(
      expect.objectContaining({ ok: false, status: 'DOWN' }),
    );
  });
});
