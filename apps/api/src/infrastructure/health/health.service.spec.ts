import { HealthService } from './health.service';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../storage/storage.service';

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const outboxCount = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    outboxEvent: { count: outboxCount },
  } as unknown as PrismaService;
  const getQueue = jest.fn();
  const queueService = { getQueue } as unknown as QueueService;
  const listFiles = jest.fn();
  const getStorageType = jest.fn();
  const storageService = {
    listFiles,
    getStorageType,
  } as unknown as StorageService;
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    outboxCount.mockResolvedValue(0);
    listFiles.mockResolvedValue([]);
    getStorageType.mockReturnValue('local');
    getQueue.mockReturnValue({
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
      getJobCounts: jest.fn().mockResolvedValue({}),
      getWorkers: jest.fn().mockResolvedValue([{ id: 'worker-1' }]),
    });
    service = new HealthService(prisma, queueService, storageService);
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

  it('reports storage provider health', async () => {
    await expect(service.checkStorage()).resolves.toEqual({
      ok: true,
      status: 'UP',
      provider: 'local',
    });

    listFiles.mockRejectedValue(new Error('storage unavailable'));
    await expect(service.checkStorage()).resolves.toEqual({
      ok: false,
      status: 'DOWN',
      provider: 'local',
      error: 'storage unavailable',
    });
  });

  it('reports active worker consumers separately from queue connectivity', async () => {
    await expect(service.checkWorker()).resolves.toEqual(
      expect.objectContaining({ ok: true, status: 'UP' }),
    );

    getQueue.mockReturnValue({
      waitUntilReady: jest.fn().mockResolvedValue(undefined),
      getWorkers: jest.fn().mockResolvedValue([]),
    });
    await expect(service.checkWorker()).resolves.toEqual(
      expect.objectContaining({ ok: false, status: 'DOWN' }),
    );
  });
});
