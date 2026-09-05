import Redis from 'ioredis';

import { assertSafeIntegrationEnvironment } from '../../test/integration-environment';

describe('Redis integration', () => {
  let redis: Redis;
  const prefix = 'it-redis-testing';
  const keys = [
    `${prefix}:tenant-a:flag`,
    `${prefix}:tenant-b:flag`,
    `${prefix}:ttl`,
  ];

  beforeAll(async () => {
    assertSafeIntegrationEnvironment();
    redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    await redis.del(...keys);
  });

  afterEach(async () => {
    await redis.del(...keys);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('supports tenant-isolated set/get/delete and serialization', async () => {
    const tenantA = `${prefix}:tenant-a:flag`;
    const tenantB = `${prefix}:tenant-b:flag`;
    const value = JSON.stringify({ enabled: true, tenantId: 'tenant-a' });

    await redis.set(tenantA, value);

    await expect(redis.get(tenantA)).resolves.toBe(value);
    await expect(redis.get(tenantB)).resolves.toBeNull();
    expect(JSON.parse((await redis.get(tenantA))!)).toEqual({
      enabled: true,
      tenantId: 'tenant-a',
    });
    await expect(redis.del(tenantA)).resolves.toBe(1);
    await expect(redis.get(tenantA)).resolves.toBeNull();
  });

  it('sets a TTL and expires the key', async () => {
    const key = `${prefix}:ttl`;
    await redis.set(key, 'temporary', 'PX', 100);

    const ttl = await redis.pttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(100);

    const deadline = Date.now() + 2000;
    let value = await redis.get(key);
    while (value !== null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      value = await redis.get(key);
    }

    expect(value).toBeNull();
  });
});
