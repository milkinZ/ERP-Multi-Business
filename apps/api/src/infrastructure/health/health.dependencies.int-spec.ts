import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';
import { HealthService } from './health.service';
import { HealthCheck } from '../redis/redis.health-indicator';
import { RedisService } from '../redis/redis.service';
import { QueueService } from '../queue/queue.service';
import { QUEUE_NAMES } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';

const postgresUrl =
  'postgresql://postgres:healthtest@127.0.0.1:15432/health_test';
const prisma = new PrismaClient({ datasources: { db: { url: postgresUrl } } });
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/1';
let healthRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const redisService = {
  getClient: () => healthRedis,
  getBullmqConnectionOptions: () => {
    const parsed = new URL(redisUrl);
    return { host: parsed.hostname, port: Number(parsed.port || 6379) };
  },
} as unknown as RedisService;
const queueService = new QueueService(redisService);
const storageService = {} as StorageService;
const healthService = new HealthService(
  prisma as never,
  queueService,
  storageService,
);
const redisHealth = new HealthCheck(redisService, {} as never);
let postgresContainer: string;

jest.setTimeout(120000);

async function waitForDatabase(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('PostgreSQL test container did not become ready');
}

describe('Health dependencies integration', () => {
  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    postgresContainer = execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        `erp-health-postgres-${process.pid}`,
        '-p',
        '15432:5432',
        '-e',
        'POSTGRES_PASSWORD=healthtest',
        '-e',
        'POSTGRES_DB=health_test',
        'postgres:16-alpine',
      ],
      { encoding: 'utf8' },
    ).trim();
    await waitForDatabase();
    await healthRedis.ping();
  });

  afterAll(async () => {
    try {
      await queueService.onModuleDestroy();
      healthRedis.disconnect();
      await prisma.$disconnect();
    } finally {
      if (postgresContainer) {
        execFileSync('docker', ['rm', '-f', postgresContainer], {
          stdio: 'ignore',
        });
      }
    }
  });

  it('reports PostgreSQL and Redis healthy, detects failure, and recovers', async () => {
    await expect(healthService.checkDb()).resolves.toEqual({ ok: true });
    await expect(redisHealth.checkRedis()).resolves.toBeUndefined();

    await prisma.$disconnect();
    healthRedis.disconnect();
    execFileSync('docker', ['stop', postgresContainer], { stdio: 'ignore' });

    await expect(healthService.checkDb()).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    );
    await expect(redisHealth.checkRedis()).rejects.toBeDefined();

    execFileSync('docker', ['start', postgresContainer], { stdio: 'ignore' });
    await waitForDatabase();
    healthRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    await healthRedis.ping();
    await expect(healthService.checkDb()).resolves.toEqual({ ok: true });
    await expect(redisHealth.checkRedis()).resolves.toBeUndefined();
  });

  it('reports queue dependency health using real Redis/BullMQ', async () => {
    await expect(healthService.checkBullmq()).resolves.toEqual(
      expect.objectContaining({ ok: true, status: 'UP' }),
    );
    expect(queueService.getQueue(QUEUE_NAMES.ORDER_QUEUE)).toBeDefined();
  });
});
