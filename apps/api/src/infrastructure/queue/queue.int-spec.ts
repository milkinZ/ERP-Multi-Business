import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../redis/redis.service';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue.constants';

describe('QueueService integration', () => {
  let redisClient: Redis;
  let redisService: RedisService;
  let queueService: QueueService;
  const queueName = QUEUE_NAMES.ANALYTICS_QUEUE;

  beforeAll(async () => {
    redisClient = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redisClient.connect();
    const config = {
      get: (key: string) =>
        key === 'redis.url' ? process.env.REDIS_URL : undefined,
    } as unknown as ConfigService;
    redisService = new RedisService(config, redisClient);
    queueService = new QueueService(redisService);
  });

  afterAll(async () => {
    const queue = queueService.getQueue(queueName);
    await queue.obliterate({ force: true });
    await queueService.onModuleDestroy();
    await redisClient.quit();
  });

  it('persists an enqueue with retry and backoff options in real Redis', async () => {
    const queue = queueService.getQueue(queueName);
    await queue.obliterate({ force: true });

    const job = await queueService.add(
      queueName,
      { tenantId: 'tenant-a', correlationId: 'job-a' },
      { jobId: 'it-queue-job-a' },
    );

    const persisted = await queue.getJob(job.id!);
    expect(persisted).not.toBeNull();
    expect(persisted?.data).toEqual({
      tenantId: 'tenant-a',
      correlationId: 'job-a',
    });
    expect(persisted?.opts.attempts).toBe(5);
    expect(persisted?.opts.backoff).toEqual({
      type: 'exponential',
      delay: 2000,
    });

    await persisted?.remove();
    await expect(queue.getJob(job.id!)).resolves.toBeUndefined();
  });
});
