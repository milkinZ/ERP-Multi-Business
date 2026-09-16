import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { HealthCheck as RedisHealthCheck } from '../redis/redis.health-indicator';

describe('HealthController', () => {
  const checkDb = jest.fn();
  const checkBullmq = jest.fn();
  const checkOutbox = jest.fn();
  const checkStorage = jest.fn();
  const checkWorker = jest.fn();
  const checkRedis = jest.fn();
  const healthService = {
    checkDb,
    checkBullmq,
    checkOutbox,
    checkStorage,
    checkWorker,
  } as unknown as HealthService;
  // The production indicator has a framework-specific constructor type; the test supplies its public method contract.

  const redisHealth = { checkRedis } as unknown as RedisHealthCheck;

  const controller = new HealthController(healthService, redisHealth);

  beforeEach(() => {
    jest.clearAllMocks();
    checkDb.mockResolvedValue({ ok: true });
    checkBullmq.mockResolvedValue({
      ok: true,
      status: 'UP',
    });
    checkOutbox.mockResolvedValue({
      ok: true,
      pending: 0,
    });
    checkStorage.mockResolvedValue({
      ok: true,
      status: 'UP',
      provider: 'local',
    });
    checkWorker.mockResolvedValue({ ok: true, status: 'UP', details: {} });
    checkRedis.mockResolvedValue(undefined);
  });

  it('reports all dependency results in the health response', async () => {
    await expect(controller.health()).resolves.toEqual({
      success: true,
      message: 'Health check OK',
      data: {
        database: { ok: true },
        redis: { ok: true },
        bullmq: { ok: true, status: 'UP' },
        outbox: { ok: true, pending: 0 },
        storage: { ok: true, status: 'UP', provider: 'local' },
        worker: { ok: true, status: 'UP', details: {} },
      },
    });
  });

  it('reports Redis failure without throwing from the health endpoint', async () => {
    checkRedis.mockRejectedValue(new Error('redis down'));

    await expect(controller.health()).resolves.toEqual(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          redis: { ok: false, reason: 'redis down' },
        }),
      }),
    );
  });

  it('marks readiness false when any required dependency is unavailable', async () => {
    checkDb.mockResolvedValue({ ok: false, error: 'db down' });

    await expect(controller.readiness()).resolves.toEqual(
      expect.objectContaining({ success: false, message: 'Not ready' }),
    );
  });
});
